// PING, 02.04.2026, CP (ClaudeCode)
// Import-Makro fuer Hub-Format JSON (snake_case, UUID-basiert)
// Liest JSON-Text aus App-Export, aktualisiert bestehende Elemente (Status, Geo, Nachfolger),
// erzeugt neue Elemente in einem neuen Nachfolge-Protokoll.
// 4 Phasen: Parse → Update → Create → Link
// GETESTET 02.04.2026 15:45 in DOCUframe

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
    STRING OldName;
    STRING NewName;
    INT i;
    INT j;
    INT AnzElemente;
    INT nUpdate;
    INT nCreate;
    INT nSkip;
    INT nWarning;
    INT LetzteNummer;
    INT NeueNummer;
    INT NameLen;
    INT NumPos;
    INT NumLen;
    BOOL bAbort;
    BOOL bIsModified;
    BOOL bIsNew;
    BOOL bProtNeuErstellt;

    // Verweise deferred (UUID-basiert)
    DBSTRINGSET VerweisSourceUuids;
    DBSTRINGSET VerweisTargetUuids;
    INT vi;

    // OID-Mapping: UUID → DOCUframe-OID
    DBSTRINGSET UuidKeys;
    DBSTRINGSET OidValues;
    INT mk;
    INT MapCount;
    STRING MappedOid;
    STRING SourceOid;
    STRING TargetOid;

    // ============================================================
    // INIT
    // ============================================================
    i = 0;
    AnzElemente = 0;
    nUpdate = 0;
    nCreate = 0;
    nSkip = 0;
    nWarning = 0;
    LetzteNummer = 0;
    bAbort = FALSE;
    bProtNeuErstellt = FALSE;
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
            // Fallback auf altes Format
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

    // Letztes Protokoll ermitteln (hoechste _Nummer)
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
    // PHASE 2: UPDATE (bestehende Elemente)
    // Ab Element 2 (Element 1 = Manifest)
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
                                IF( !GeoJSon.GetElement( 1 ).IsNull() )
                                    Elem._PINGGeoLat = GeoJSon.GetMember( "geo_lat", FALSE ).GetNumber();
                                    Elem._PINGGeoLon = GeoJSon.GetMember( "geo_lon", FALSE ).GetNumber();
                                    Elem._PINGGeoAccuracy = GeoJSon.GetMember( "geo_accuracy", FALSE ).GetNumber();
                                    Elem._PINGGeoHeading = GeoJSon.GetMember( "geo_heading", FALSE ).GetNumber();
                                    Elem._PINGGeoText = GeoJSon.GetMember( "geo_text", FALSE ).GetString();
                                    Elem._PINGGeoAltitude = GeoJSon.GetMember( "geo_altitude", FALSE ).GetNumber();
                                ENDIF

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
                                        Elem._PINGMobilDatum = sVal;
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
                        // legacy_id vorhanden, aber nicht modified → OID-Mapping trotzdem eintragen
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
    // ============================================================
    IF( !bAbort )
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

                        // --- 3a: Neues Protokoll erstellen (einmalig) ---
                        IF( !bProtNeuErstellt )
                            NeueNummer = LetzteNummer + 1;

                            // Name fortschreiben: letzte Zahl im Namen inkrementieren
                            OldName = LetzteProt._Name;
                            NameLen = OldName.GetLength();
                            // Von hinten Ziffern suchen
                            NumPos = OldName.ReverseFindOneNotOf( "0123456789" );
                            IF( NumPos >= 0 )
                                NumLen = NameLen - NumPos - 1;
                                IF( NumLen > 0 )
                                    NewName = OldName.Left( NumPos + 1 ) + NeueNummer.ToStr();
                                ELSE
                                    // Keine Zahl am Ende → Nummer anhaengen
                                    NewName = OldName + " " + NeueNummer.ToStr();
                                ENDIF
                            ELSE
                                // Gesamter Name ist Zahl
                                NewName = NeueNummer.ToStr();
                            ENDIF

                            ProtNeu.Create();
                            ProtNeu._Protokollgruppe = ProtGrp;
                            ProtNeu._Name = NewName;
                            ProtNeu._Nummer = NeueNummer;
                            ProtNeu._Ort = LetzteProt._Ort;
                            ProtNeu._Vorbemerkung = LetzteProt._Vorbemerkung;
                            ProtNeu._Nachbemerkung = LetzteProt._Nachbemerkung;
                            ProtNeu._Signatur = LetzteProt._Signatur;
                            ProtNeu._TeilnehmerAnmerkung = LetzteProt._TeilnehmerAnmerkung;

                            // Teilnehmer vom letzten Protokoll uebernehmen
                            ProtNeu._Teilnehmer.AddSet( LetzteProt._Teilnehmer );
                            // Verteiler vom letzten Protokoll uebernehmen
                            ProtNeu._Verteiler.AddSet( LetzteProt._Verteiler );

                            ProtNeu.Store();
                            bProtNeuErstellt = TRUE;
                            Trace( strace + "Neues Protokoll erstellt: %1 (Nr. %2)", NewName, NeueNummer.ToStr() );

                            // Protokollgruppe: _ProtokolleSet um neues Protokoll erweitern
                            IF( ProtGrp.LockRefresh( WRITE_NOWRITE, FLAT ) )
                                ProtGrp._Protokolle.AddObject( ProtNeu );
                                ProtGrp.StoreUnlock( WRITE_NOWRITE, FLAT );
                            ENDIF
                        ENDIF

                        // --- 3b: Neues Element anlegen ---
                        ElemNeu.Create();
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
                                ElemNeu._Termin = sVal.ToTime();
                            ENDIF
                        ENDIF

                        // Verantwortlicher (ueber legacy_id des Verantwortlichen)
                        sVal = ItemJSon.GetMember( "verantwortlicher_legacy_id", FALSE ).GetString();
                        IF( sVal != "" )
                            Verantw.FromOID( sVal );
                            IF( !Verantw.IsEmpty() )
                                ElemNeu._Verantwortlicher = Verantw;
                            ENDIF
                        ENDIF

                        // Geolocation
                        GeoJSon = ItemJSon.GetMember( "mobile_erfassung", FALSE );
                        IF( !GeoJSon.GetElement( 1 ).IsNull() )
                            ElemNeu._PINGGeoLat = GeoJSon.GetMember( "geo_lat", FALSE ).GetNumber();
                            ElemNeu._PINGGeoLon = GeoJSon.GetMember( "geo_lon", FALSE ).GetNumber();
                            ElemNeu._PINGGeoAccuracy = GeoJSon.GetMember( "geo_accuracy", FALSE ).GetNumber();
                            ElemNeu._PINGGeoHeading = GeoJSon.GetMember( "geo_heading", FALSE ).GetNumber();
                            ElemNeu._PINGGeoText = GeoJSon.GetMember( "geo_text", FALSE ).GetString();
                            ElemNeu._PINGGeoAltitude = GeoJSon.GetMember( "geo_altitude", FALSE ).GetNumber();
                        ENDIF

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
                                ElemNeu._PINGMobilDatum = sVal.ToTime();
                            ENDIF
                        ENDIF

                        ElemNeu.Store();
                        nCreate = nCreate + 1;

                        // OID-Mapping
                        UuidKeys.Add( uuidVal );
                        OidValues.Add( ElemNeu.GetOID() );
                        Trace( strace + "Element CREATE: %1 → %2", uuidVal, ElemNeu.GetOID() );

                        // Verweise merken (fuer Phase 4)
                        ArrJSon = ItemJSon.GetMember( "verweise", FALSE );
                        IF( !ArrJSon.GetElement( 1 ).IsNull() )
                            j = 1;
                            WHILE( j <= ArrJSon.GetElementCount() )
                                VerweisSourceUuids.Add( uuidVal );
                                VerweisTargetUuids.Add( ArrJSon.GetElement( j ).GetString() );
                                j = j + 1;
                            ENDWHILE
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
            // Source-UUID → DOCUframe-OID (per []-Operator, 1-basiert)
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

            // Target-UUID → DOCUframe-OID
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
                                Trace( strace + "Verweis: %1 → %2", SourceOid, TargetOid );
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
        ErrorMsg = ErrorMsg + "Updates:  " + nUpdate.ToStr() + "\r\n";
        ErrorMsg = ErrorMsg + "Creates:  " + nCreate.ToStr() + "\r\n";
        ErrorMsg = ErrorMsg + "Skipped:  " + nSkip.ToStr() + "\r\n";
        ErrorMsg = ErrorMsg + "Verweise: " + VerweisSourceUuids.GetCount().ToStr() + "\r\n";
        ErrorMsg = ErrorMsg + "Warnings: " + nWarning.ToStr() + "\r\n";
        Trace( strace + "Fertig. Updates=%1 Creates=%2 Warnings=%3", nUpdate.ToStr(), nCreate.ToStr(), nWarning.ToStr() );
    ENDIF

RETURN( bAbort.ToInt() );
