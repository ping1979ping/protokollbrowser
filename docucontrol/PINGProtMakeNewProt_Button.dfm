INT PINGProtMakeNewProt_Button( HDIALOG Dialog, DBOBJECT &Object )
  // 09.04.2026 - Click-Button-Wrapper, ersetzt das alte inline-Button-Makro.
  // Erfragt das Protokolldatum, ruft das headless Makro PINGProtMakeNewProt auf
  // und bietet anschliessend die Status-Konvertierung der Vorgaenger-Elemente an.
  _PINGProtokollgruppe ProtGrp;
  _PINGProtokoll NeuesProtokoll, LetztesProtokoll;
  _PINGProtokollelement Element;
  _PINGProtokollelementSet ElementSet;
  TIME T;
  INT rc;
  INT Anzahl, Anzahl2, Message;

  // Cast auf Protokollgruppe
  ProtGrp = Object;

  // *********************************************************
  // Datum erfragen
  T = TimeGetCurrTime( FALSE );
  IF( T.ShowDateTimeEditDlg( LANGID_GERMAN, FALSE, "Protokolldatum eingeben" ) != IDOK )
    RETURN( 0 );
  ENDIF

  // *********************************************************
  // Headless-Makro aufrufen
  rc = PINGProtMakeNewProt( ProtGrp, NeuesProtokoll );
  IF( rc != 0 )
    MessageBox( "Neues Protokoll konnte nicht angelegt werden (Lock/Refresh fehlgeschlagen).", MB_ICONEXCLAMATION );
    RETURN( 1 );
  ENDIF

  // *********************************************************
  // Datum und Name mit Benutzer-Auswahl ueberschreiben
  IF( NeuesProtokoll.LockRefresh( WRITE_NOWRITE, FLAT, 1, TRUE ) )
    NeuesProtokoll._Datum = T;
    NeuesProtokoll._Name = ProtGrp._Name + " " + IntToStr( NeuesProtokoll._Nummer ) + " - " + ( T.FormatDateStr( "yyyy" ) );
    NeuesProtokoll.StoreUnlock();
  ENDIF

  MessageBox( "Neues Protokoll erstellt, \ndie Daten aus letztem Protokoll kopiert, bitte anpassen.", MB_ICONINFORMATION );

  // *********************************************************
  // Status-Konvertierung im Vorgaenger-Protokoll anbieten
  // Letztes regulaeres Protokoll vor dem neuen: Nummer = NeuesProtokoll._Nummer - 1
  FOREACH( LetztesProtokoll; ProtGrp._Protokolle )
    IF( LetztesProtokoll._Nummer == NeuesProtokoll._Nummer - 1 )
      BREAK;
    ENDIF
  ENDEACH

  IF( LetztesProtokoll._Nummer == NeuesProtokoll._Nummer - 1 )
    LetztesProtokoll.GetObjectSet( "_Protokollelemente", ElementSet );

    Anzahl = 0;  // Zaehler Status NEU
    Anzahl2 = 0; // Zaehler Status ERLEDIGT (Info)
    FOREACH( Element; ElementSet )
      IF( Element._Status == 0 )
        Anzahl += 1;
      ENDIF
      IF( Element._Status == 17 )
        Anzahl2 += 1;
      ENDIF
    ENDEACH

    IF( Anzahl > 0 )
      Message = MessageBox( Anzahl.ToStr() + " Eintraege sind im letzten Protokoll als NEU markiert. \r\nSoll der Status von NEU auf OFFEN gesetzt werden?", MB_YESNO );
      IF( Message == IDYES )
        FOREACH( Element; ElementSet )
          IF( Element._Status == 0 )
            IF( Element.LockRefresh() )
              Element._Status = 10;
              Element.StoreUnlock();
            ENDIF
          ENDIF
        ENDEACH
      ENDIF
    ENDIF

    IF( Anzahl2 > 0 )
      Message = MessageBox( Anzahl2.ToStr() + " Eintraege sind im letzten Protokoll als ERLEDIGT (Info) markiert. \r\nSoll der Status von ERLEDIGT (Info) auf ERLEDIGT gesetzt werden?", MB_YESNO );
      IF( Message == IDYES )
        FOREACH( Element; ElementSet )
          IF( Element._Status == 17 )
            IF( Element.LockRefresh() )
              Element._Status = 20;
              Element.StoreUnlock();
            ENDIF
          ENDIF
        ENDEACH
      ENDIF
    ENDIF
  ENDIF

  // Dialog-Refresh
  Dialog.FieldRefresh( "PINGProtokolle" );
  Dialog.SetFieldActObject( "PINGProtokolle", NeuesProtokoll );

RETURN( 0 );
