// PING, 02.04.2026, CP (ClaudeCode)
// Import-Makro fuer Hub-Format JSON (snake_case, UUID-basiert)
// Liest JSON-Text aus App-Export, aktualisiert bestehende Elemente (Status, Geo, ...),
// erzeugt neue Elemente im richtigen Ziel-Protokoll.
//
// 09.04.2026, CP: Refactoring v3
//  - Phase 2a "Protokoll-Routing" NEU: baut App-UUID -> DOCUframe-OID Mapping
//    fuer Protokoll-Bloecke im JSON auf.
//  - Phase 3 (Element-Create) schlaegt Ziel-Protokoll ueber protokoll_id (App-UUID)
//    im Mapping nach -> Anhangprotokoll-Routing funktioniert automatisch.
//  - Aufruf des benannten Makros PINGProtMakeNewProt fuer neue Protokolle.
//  - Bugfix: ElemNeu._Protokoll wurde bisher nicht explizit gesetzt.
//  - Bugfix: sVal.ToTime() wird jetzt immer ueber TIME-Variable zugewiesen.
//  - GeoJSon-IF-Check entfernt (war falsch).
//
// Phasen: Parse -> Routing -> Update -> Create -> Link

INT PINGProtGrpImpJSON( STRING JsonText, STRING &ErrorMsg )
  HJSON JSon;
  HJSON ItemJSon;
  HJSON ManifestJSon;
  HJSON GeoJSon;
  HJSON ArrJSon;
  STRING strace = "#### JSON-Import Hub: ";

  _PINGProtokollgruppe ProtGrp;
  _PINGProtokoll Prot;
  _PINGProtokoll LetzteProt;
  _PINGProtokoll ProtNeu;
  _PINGProtokoll ProtExisting;
  _PINGProtokoll ZielProt;
  _PINGProtokollSet ProtSet;
  _PINGProtokollelement Elem;
  _PINGProtokollelement ElemNeu;
  _PINGProtokollelement RefElem;
  Adresse Verantw;
  Ansprechpartner TeilnObj;

  STRING GruppeOid;
  STRING oidVal;
  STRING legacyId;
  STRING uuidVal;
  STRING sVal;
  STRING objType;
  STRING appUuid;
  STRING parentUuid;
  STRING parentOid;
  INT i;
  INT j;
  INT AnzElemente;
  INT nUpdate;
  INT nCreate;
  INT nSkip;
  INT nWarning;
  INT nProtNeu;
  INT LetzteNummer;
  BOOL bAbort;
  BOOL bIsModified;
  BOOL bIsNew;
  TIME T;

  // Verweise deferred (UUID-basiert)
  DBSTRINGSET VerweisSourceUuids;
  DBSTRINGSET VerweisTargetUuids;
  INT vi;

  // Element-OID-Mapping: UUID -> DOCUframe-OID
  DBSTRINGSET UuidKeys;
  DBSTRINGSET OidValues;
  INT mk;
  INT MapCount;
  STRING SourceOid;
  STRING TargetOid;

  // Protokoll-OID-Mapping: App-UUID (protokoll_id) -> DOCUframe-OID
  DBSTRINGSET ProtUuidKeys;
  DBSTRINGSET ProtOidValues;
  INT pk;
  INT ProtMapCount;

  // ============================================================
  // INIT
  // ============================================================
  i = 0;
  AnzElemente = 0;
  nUpdate = 0;
  nCreate = 0;
  nSkip = 0;
  nWarning = 0;
  nProtNeu = 0;
  LetzteNummer = 0;
  bAbort = FALSE;
  ErrorMsg = "";

  // ============================================================
  // PHASE 1: PARSE & VALIDATE
  // ============================================================
  JSon.Construct();
  JSon.SetText( JsonText );
  AnzElemente = JSon.GetElementCount();
  Trace( strace + "JSON gelesen, %1 Elemente", AnzElemente.ToStr() );

  IF( AnzElemente < 1 )
    ErrorMsg = "FEHLER: JSON leer oder ungueltig.";
    bAbort = TRUE;
  ENDIF

  // Manifest lesen (Element 1, 1-basiert)
  IF( !bAbort )
    ManifestJSon = JSon.GetElement( 1 );
    GruppeOid = ManifestJSon.GetMember( "gruppe_id", FALSE ).GetString();
    IF( GruppeOid == "" )
      GruppeOid = ManifestJSon.GetMember( "GruppeId", FALSE ).GetString();
    ENDIF
    IF( GruppeOid == "" )
      ErrorMsg = "FEHLER: Keine gruppe_id im Manifest.";
      bAbort = TRUE;
    ENDIF
  ENDIF

  // Protokollgruppe laden
  IF( !bAbort )
    ProtGrp.FromOID( GruppeOid );
    IF( ProtGrp.IsEmpty() )
      ErrorMsg = "FEHLER: Protokollgruppe nicht gefunden (OID: " + GruppeOid + ").";
      bAbort = TRUE;
    ENDIF
  ENDIF

  // Letztes Protokoll ermitteln (fuer Diagnose / Trace)
  IF( !bAbort )
    Trace( strace + "Gruppe: %1 (%2)", ProtGrp._Name, GruppeOid );
    ProtSet = ProtGrp._Protokolle;
    IF( ProtSet.Get( Prot, 1, START ) )
      REPEAT
        IF( Prot._Nummer > LetzteNummer )
          LetzteNummer = Prot._Nummer;
          LetzteProt = Prot;
        ENDIF
      UNTIL( !ProtSet.Get( Prot, 1, CURRENT ) )
    ENDIF
    Trace( strace + "Letztes Protokoll Nr. %1", LetzteNummer.ToStr() );
  ENDIF

  // ============================================================
  // PHASE 2a: PROTOKOLL-ROUTING (NEU)
  // Baut Mapping App-UUID (protokoll_id) -> DOCUframe-OID auf.
  // Drei Faelle pro Protokoll-Block:
  //   1) legacy_id == ""              -> neues Protokoll via PINGProtMakeNewProt
  //   2) legacy_id gefuellt, FromOID ok -> existierendes Protokoll (i.d.R. Anhang),
  //                                         Metadaten bleiben unangetastet
  //   3) legacy_id gefuellt, FromOID fail -> Fallback: neues Protokoll mit Warn-Marker
  // ============================================================
  IF( !bAbort )
    i = 2;
    WHILE( i <= AnzElemente )
      ItemJSon = JSon.GetElement( i );
      objType = ItemJSon.GetMember( "object_type", FALSE ).GetString();

      IF( objType == "protokoll" )
        appUuid = ItemJSon.GetMember( "id", FALSE ).GetString();
        legacyId = ItemJSon.GetMember( "legacy_id", FALSE ).GetString();

        IF( legacyId == "" )
          // --- Fall 1: Neues Protokoll ---
          IF( PINGProtMakeNewProt( ProtGrp, ProtNeu ) == 0 )
            // Metadaten aus dem JSON-Block uebernehmen
            IF( ProtNeu.LockRefresh( WRITE_NOWRITE, FLAT, 1, TRUE ) )
              ProtNeu._Name = ItemJSon.GetMember( "Name", FALSE ).GetString();
              sVal = ItemJSon.GetMember( "Datum", FALSE ).GetString();
              IF( sVal != "" )
                IF( sVal != "01.01.1601 00:00:00" )
                  T = sVal.ToTime();
                  ProtNeu._Datum = T;
                ENDIF
              ENDIF
              ProtNeu._Ort = ItemJSon.GetMember( "Ort", FALSE ).GetString();
              ProtNeu._Autor = ItemJSon.GetMember( "Autor", FALSE ).GetString();
              ProtNeu._Vorbemerkung = ItemJSon.GetMember( "Vorbemerkung", FALSE ).GetString();
              ProtNeu._Nachbemerkung = ItemJSon.GetMember( "Nachbemerkung", FALSE ).GetString();
              ProtNeu._Signatur = ItemJSon.GetMember( "Signatur", FALSE ).GetString();
              ProtNeu.StoreUnlock();
            ENDIF

            ProtUuidKeys.Add( appUuid );
            ProtOidValues.Add( ProtNeu.GetOID() );
            nProtNeu = nProtNeu + 1;
            Trace( strace + "Neues Protokoll: %1 -> %2", appUuid, ProtNeu.GetOID() );
          ELSE
            ErrorMsg = ErrorMsg + "FEHLER: PINGProtMakeNewProt fehlgeschlagen fuer " + appUuid + "\r\n";
            nWarning = nWarning + 1;
          ENDIF

        ELSE
          // --- Fall 2: Existierendes Protokoll laden ---
          ProtExisting.FromOID( legacyId );
          IF( !ProtExisting.IsEmpty() )
            // Mapping eintragen, Metadaten bleiben unangetastet
            ProtUuidKeys.Add( appUuid );
            ProtOidValues.Add( legacyId );
            Trace( strace + "Protokoll existiert: %1 -> %2 (Nummer %3)", appUuid, legacyId, ProtExisting._Nummer.ToStr() );

          ELSE
            // --- Fall 3: OID nicht gefunden, Fallback mit Warn-Marker ---
            Trace( strace + "WARN: OID %1 nicht gefunden, erzeuge Ersatz-Protokoll", legacyId );
            IF( PINGProtMakeNewProt( ProtGrp, ProtNeu ) == 0 )
              IF( ProtNeu.LockRefresh( WRITE_NOWRITE, FLAT, 1, TRUE ) )
                ProtNeu._Name = ItemJSon.GetMember( "Name", FALSE ).GetString() + " (Achtung aus fehlender OID " + legacyId + " hergestellt!)";
                sVal = ItemJSon.GetMember( "Datum", FALSE ).GetString();
                IF( sVal != "" )
                  IF( sVal != "01.01.1601 00:00:00" )
                    T = sVal.ToTime();
                    ProtNeu._Datum = T;
                  ENDIF
                ENDIF
                ProtNeu._Ort = ItemJSon.GetMember( "Ort", FALSE ).GetString();
                ProtNeu._Autor = ItemJSon.GetMember( "Autor", FALSE ).GetString();
                ProtNeu._Vorbemerkung = ItemJSon.GetMember( "Vorbemerkung", FALSE ).GetString();
                ProtNeu._Nachbemerkung = ItemJSon.GetMember( "Nachbemerkung", FALSE ).GetString();
                ProtNeu._Signatur = ItemJSon.GetMember( "Signatur", FALSE ).GetString();
                ProtNeu.StoreUnlock();
              ENDIF

              ProtUuidKeys.Add( appUuid );
              ProtOidValues.Add( ProtNeu.GetOID() );
              nProtNeu = nProtNeu + 1;
              ErrorMsg = ErrorMsg + "WARNUNG: OID " + legacyId + " nicht gefunden, Ersatz-Protokoll angelegt.\r\n";
              nWarning = nWarning + 1;
            ELSE
              ErrorMsg = ErrorMsg + "FEHLER: PINGProtMakeNewProt-Fallback fehlgeschlagen fuer " + appUuid + "\r\n";
              nWarning = nWarning + 1;
            ENDIF
          ENDIF
        ENDIF
      ENDIF

      i = i + 1;
    ENDWHILE
  ENDIF

  // ============================================================
  // PHASE 2b: UPDATE (bestehende Elemente)
  // ============================================================
  IF( !bAbort )
    i = 2;
    WHILE( i <= AnzElemente )
      ItemJSon = JSon.GetElement( i );
      objType = ItemJSon.GetMember( "object_type", FALSE ).GetString();

      IF( objType == "protokollelement" )
        legacyId = ItemJSon.GetMember( "legacy_id", FALSE ).GetString();
        uuidVal = ItemJSon.GetMember( "id", FALSE ).GetString();
        bIsModified = ItemJSon.GetMember( "is_modified", FALSE ).GetBool();
        bIsNew = ItemJSon.GetMember( "is_new", FALSE ).GetBool();

        // UPDATE: legacy_id vorhanden UND is_modified
        IF( legacyId != "" )
          IF( bIsModified )
            Elem.FromOID( legacyId );
            IF( !Elem.IsEmpty() )
              IF( Elem.LockRefresh( WRITE_NOWRITE, FLAT ) )
                Trace( strace + "Element UPDATE: %1", legacyId );

                // Status
                Elem._Status = ItemJSon.GetMember( "status", FALSE ).GetNumber().ToInt();

                // Geolocation
                GeoJSon = ItemJSon.GetMember( "mobile_erfassung", FALSE );
                Elem._PINGGeoLat = GeoJSon.GetMember( "geo_lat", FALSE ).GetNumber();
                Elem._PINGGeoLon = GeoJSon.GetMember( "geo_lon", FALSE ).GetNumber();
                Elem._PINGGeoAccuracy = GeoJSon.GetMember( "geo_accuracy", FALSE ).GetNumber();
                Elem._PINGGeoHeading = GeoJSon.GetMember( "geo_heading", FALSE ).GetNumber();
                Elem._PINGGeoText = GeoJSon.GetMember( "geo_text", FALSE ).GetString();
                Elem._PINGGeoAltitude = GeoJSon.GetMember( "geo_altitude", FALSE ).GetNumber();

                // Mobile-Metadaten
                Elem._PINGFotoAnzahl = ItemJSon.GetMember( "foto_anzahl", FALSE ).GetNumber().ToInt();
                Elem._PINGFotoPfad = ItemJSon.GetMember( "foto_pfad", FALSE ).GetString();
                Elem._PINGMobilErfasst = ItemJSon.GetMember( "mobil_erfasst", FALSE ).GetBool();
                Elem._PINGMobilUser = ItemJSon.GetMember( "mobil_user", FALSE ).GetString();
                Elem._PINGNotiz = ItemJSon.GetMember( "notiz", FALSE ).GetString();
                Elem._PINGInfo = ItemJSon.GetMember( "info", FALSE ).GetString();
                sVal = ItemJSon.GetMember( "mobil_datum", FALSE ).GetString();
                IF( sVal != "" )
                  IF( sVal != "01.01.1601 00:00:00" )
                    T = sVal.ToTime();
                    Elem._PINGMobilDatum = T;
                  ENDIF
                ENDIF

                Elem.StoreUnlock( WRITE_NOWRITE, FLAT );
                nUpdate = nUpdate + 1;

                // OID-Mapping eintragen
                UuidKeys.Add( uuidVal );
                OidValues.Add( legacyId );
              ELSE
                ErrorMsg = ErrorMsg + "WARNUNG: Element nicht sperrbar: " + legacyId + "\r\n";
                nWarning = nWarning + 1;
              ENDIF
            ELSE
              ErrorMsg = ErrorMsg + "WARNUNG: Element nicht gefunden: " + legacyId + "\r\n";
              nWarning = nWarning + 1;
            ENDIF
          ELSE
            // legacy_id vorhanden, aber nicht modified -> OID-Mapping trotzdem eintragen
            UuidKeys.Add( uuidVal );
            OidValues.Add( legacyId );
            nSkip = nSkip + 1;
          ENDIF

          // Verweise merken (fuer Phase 4)
          ArrJSon = ItemJSon.GetMember( "verweise", FALSE );
          IF( ArrJSon.GetElementCount() > 0 )
            j = 1;
            WHILE( j <= ArrJSon.GetElementCount() )
              VerweisSourceUuids.Add( uuidVal );
              VerweisTargetUuids.Add( ArrJSon.GetElement( j ).GetString() );
              j = j + 1;
            ENDWHILE
          ENDIF
        ENDIF
      ENDIF

      i = i + 1;
    ENDWHILE
  ENDIF

  // ============================================================
  // PHASE 3: CREATE (neue Elemente)
  // Ziel-Protokoll wird ueber protokoll_id (App-UUID) im ProtUuidKeys-Mapping
  // nachgeschlagen (Phase 2a hat das Mapping aufgebaut).
  // ============================================================
  IF( !bAbort )
    ProtMapCount = ProtUuidKeys.GetCount();
    i = 2;
    WHILE( i <= AnzElemente )
      ItemJSon = JSon.GetElement( i );
      objType = ItemJSon.GetMember( "object_type", FALSE ).GetString();

      IF( objType == "protokollelement" )
        legacyId = ItemJSon.GetMember( "legacy_id", FALSE ).GetString();
        uuidVal = ItemJSon.GetMember( "id", FALSE ).GetString();
        bIsNew = ItemJSon.GetMember( "is_new", FALSE ).GetBool();

        IF( legacyId == "" )
          IF( bIsNew )

            // --- Eltern-Protokoll aus Mapping holen ---
            parentUuid = ItemJSon.GetMember( "protokoll_id", FALSE ).GetString();
            parentOid = "";
            pk = 1;
            WHILE( pk <= ProtMapCount )
              IF( ProtUuidKeys[ pk ] == parentUuid )
                parentOid = ProtOidValues[ pk ];
                pk = ProtMapCount + 1;
              ELSE
                pk = pk + 1;
              ENDIF
            ENDWHILE

            IF( parentOid == "" )
              ErrorMsg = ErrorMsg + "WARNUNG: parentUuid " + parentUuid + " nicht im Mapping (Element " + uuidVal + ").\r\n";
              nWarning = nWarning + 1;
            ELSE
              ZielProt.FromOID( parentOid );
              IF( ZielProt.IsEmpty() )
                ErrorMsg = ErrorMsg + "WARNUNG: Zielprotokoll-OID " + parentOid + " nicht ladbar.\r\n";
                nWarning = nWarning + 1;
              ELSE
                IF( ZielProt.LockRefresh( WRITE_NOWRITE, FLAT ) )

                  // --- Neues Element anlegen ---
                  ElemNeu.Create( "_PINGProtokollelement" );
                  ElemNeu._Protokoll = ZielProt;
                  ElemNeu._Position = ItemJSon.GetMember( "position", FALSE ).GetString();
                  ElemNeu._Positionstitel = ItemJSon.GetMember( "positionstitel", FALSE ).GetString();
                  ElemNeu._Positionstext = ItemJSon.GetMember( "positionstext", FALSE ).GetString();
                  ElemNeu._Thema = ItemJSon.GetMember( "thema", FALSE ).GetString();
                  ElemNeu._Status = ItemJSon.GetMember( "status", FALSE ).GetNumber().ToInt();
                  ElemNeu._Bemerkung = ItemJSon.GetMember( "bemerkung", FALSE ).GetString();
                  ElemNeu._Erinnerung = ItemJSon.GetMember( "erinnerung", FALSE ).GetBool();
                  ElemNeu._Wert = ItemJSon.GetMember( "wert", FALSE ).GetNumber();

                  // Termin
                  sVal = ItemJSon.GetMember( "termin", FALSE ).GetString();
                  IF( sVal != "" )
                    IF( sVal != "01.01.1601 00:00:00" )
                      T = sVal.ToTime();
                      ElemNeu._Termin = T;
                    ENDIF
                  ENDIF

                  // Verantwortlicher (ueber legacy_id)
                  sVal = ItemJSon.GetMember( "verantwortlicher_legacy_id", FALSE ).GetString();
                  IF( sVal != "" )
                    Verantw.FromOID( sVal );
                    IF( !Verantw.IsEmpty() )
                      ElemNeu._Verantwortlicher = Verantw;
                    ENDIF
                  ENDIF

                  // Geolocation
                  GeoJSon = ItemJSon.GetMember( "mobile_erfassung", FALSE );
                  ElemNeu._PINGGeoLat = GeoJSon.GetMember( "geo_lat", FALSE ).GetNumber();
                  ElemNeu._PINGGeoLon = GeoJSon.GetMember( "geo_lon", FALSE ).GetNumber();
                  ElemNeu._PINGGeoAccuracy = GeoJSon.GetMember( "geo_accuracy", FALSE ).GetNumber();
                  ElemNeu._PINGGeoHeading = GeoJSon.GetMember( "geo_heading", FALSE ).GetNumber();
                  ElemNeu._PINGGeoText = GeoJSon.GetMember( "geo_text", FALSE ).GetString();
                  ElemNeu._PINGGeoAltitude = GeoJSon.GetMember( "geo_altitude", FALSE ).GetNumber();

                  // Mobile-Metadaten
                  ElemNeu._PINGFotoAnzahl = ItemJSon.GetMember( "foto_anzahl", FALSE ).GetNumber().ToInt();
                  ElemNeu._PINGFotoPfad = ItemJSon.GetMember( "foto_pfad", FALSE ).GetString();
                  ElemNeu._PINGMobilErfasst = ItemJSon.GetMember( "mobil_erfasst", FALSE ).GetBool();
                  ElemNeu._PINGMobilUser = ItemJSon.GetMember( "mobil_user", FALSE ).GetString();
                  ElemNeu._PINGNotiz = ItemJSon.GetMember( "notiz", FALSE ).GetString();
                  ElemNeu._PINGInfo = ItemJSon.GetMember( "info", FALSE ).GetString();
                  sVal = ItemJSon.GetMember( "mobil_datum", FALSE ).GetString();
                  IF( sVal != "" )
                    IF( sVal != "01.01.1601 00:00:00" )
                      T = sVal.ToTime();
                      ElemNeu._PINGMobilDatum = T;
                    ENDIF
                  ENDIF

                  ElemNeu.Store();
                  ZielProt._Protokollelemente.AddObject( ElemNeu );
                  ZielProt.StoreUnlock( WRITE_NOWRITE, FLAT );

                  nCreate = nCreate + 1;

                  // OID-Mapping fuer Phase 4 (Verweise)
                  UuidKeys.Add( uuidVal );
                  OidValues.Add( ElemNeu.GetOID() );
                  Trace( strace + "Element CREATE: %1 -> %2 in %3", uuidVal, ElemNeu.GetOID(), parentOid );

                  // Verweise merken
                  ArrJSon = ItemJSon.GetMember( "verweise", FALSE );
                  IF( ArrJSon.GetElementCount() > 0 )
                    j = 1;
                    WHILE( j <= ArrJSon.GetElementCount() )
                      VerweisSourceUuids.Add( uuidVal );
                      VerweisTargetUuids.Add( ArrJSon.GetElement( j ).GetString() );
                      j = j + 1;
                    ENDWHILE
                  ENDIF
                ELSE
                  ErrorMsg = ErrorMsg + "WARNUNG: Zielprotokoll nicht sperrbar: " + parentOid + "\r\n";
                  nWarning = nWarning + 1;
                ENDIF
              ENDIF
            ENDIF
          ENDIF
        ENDIF
      ENDIF

      i = i + 1;
    ENDWHILE
  ENDIF

  // ============================================================
  // PHASE 4: LINK (Verweise nachtraeglich setzen)
  // ============================================================
  IF( !bAbort )
    MapCount = UuidKeys.GetCount();
    vi = 1;
    WHILE( vi <= VerweisSourceUuids.GetCount() )
      // Source-UUID -> DOCUframe-OID
      SourceOid = "";
      mk = 1;
      WHILE( mk <= MapCount )
        IF( UuidKeys[ mk ] == VerweisSourceUuids[ vi ] )
          SourceOid = OidValues[ mk ];
          mk = MapCount + 1;
        ELSE
          mk = mk + 1;
        ENDIF
      ENDWHILE

      // Target-UUID -> DOCUframe-OID
      TargetOid = "";
      mk = 1;
      WHILE( mk <= MapCount )
        IF( UuidKeys[ mk ] == VerweisTargetUuids[ vi ] )
          TargetOid = OidValues[ mk ];
          mk = MapCount + 1;
        ELSE
          mk = mk + 1;
        ENDIF
      ENDWHILE

      IF( SourceOid != "" )
        IF( TargetOid != "" )
          Elem.FromOID( SourceOid );
          RefElem.FromOID( TargetOid );
          IF( !Elem.IsEmpty() )
            IF( !RefElem.IsEmpty() )
              IF( Elem.LockRefresh( WRITE_NOWRITE, FLAT ) )
                Elem.Link( RefElem, "_Verweise" );
                Elem.StoreUnlock( WRITE_NOWRITE, FLAT );
                Trace( strace + "Verweis: %1 -> %2", SourceOid, TargetOid );
              ELSE
                ErrorMsg = ErrorMsg + "WARNUNG: Verweis-Quelle nicht sperrbar: " + SourceOid + "\r\n";
                nWarning = nWarning + 1;
              ENDIF
            ELSE
              ErrorMsg = ErrorMsg + "WARNUNG: Verweis-Ziel ungueltig (OID): " + TargetOid + "\r\n";
              nWarning = nWarning + 1;
            ENDIF
          ENDIF
        ELSE
          ErrorMsg = ErrorMsg + "WARNUNG: Verweis-Ziel nicht im Mapping: " + VerweisTargetUuids[ vi ] + "\r\n";
          nWarning = nWarning + 1;
        ENDIF
      ENDIF

      vi = vi + 1;
    ENDWHILE
  ENDIF

  // ============================================================
  // ZUSAMMENFASSUNG
  // ============================================================
  JSon.Destruct();

  IF( !bAbort )
    ErrorMsg = ErrorMsg + "--- Zusammenfassung ---\r\n";
    ErrorMsg = ErrorMsg + "Protokolle neu: " + nProtNeu.ToStr() + "\r\n";
    ErrorMsg = ErrorMsg + "Updates:        " + nUpdate.ToStr() + "\r\n";
    ErrorMsg = ErrorMsg + "Creates:        " + nCreate.ToStr() + "\r\n";
    ErrorMsg = ErrorMsg + "Skipped:        " + nSkip.ToStr() + "\r\n";
    ErrorMsg = ErrorMsg + "Verweise:       " + VerweisSourceUuids.GetCount().ToStr() + "\r\n";
    ErrorMsg = ErrorMsg + "Warnings:       " + nWarning.ToStr() + "\r\n";
    Trace( strace + "Fertig. ProtNeu=%1 Updates=%2 Creates=%3 Warnings=%4", nProtNeu.ToStr(), nUpdate.ToStr(), nCreate.ToStr(), nWarning.ToStr() );
  ENDIF

RETURN( bAbort.ToInt() );
