INT PINGProtMakeNewProt( _PINGProtokollgruppe &Object, _PINGProtokoll &NeuesProtokoll )
  // 09.04.2026 - Headless-Variante, extrahiert aus dem Button-Makro PINGProtMakeNewProt (20.06.2024)
  // Wird sowohl vom Click-Button-Wrapper (PINGProtMakeNewProt_Button) als auch vom
  // Import-Worker (PINGProtGrpImpJSON) aufgerufen.
  // KEINE Benutzer-Interaktion (kein Dialog, keine MessageBox).
  _PINGProtokoll Protokoll, LetztesProtokoll;
  _PINGProtokollSet ProtokolleSet, AnhangSet;
  _PINGProtokollelement Element;
  BOOL gefunden = FALSE;
  TIME T;
  INT nProtokolle, maxProtokolle;
  INT Position, PositionNP, nAnhang, maxAnhang;
  INT AnzahlElementPositionen = 0;
  STRING LetztePos;
  STRING Counter;
  INT i;

  // Datum: aktueller Zeitpunkt (kann vom Caller spaeter ueberschrieben werden)
  T = TimeGetCurrTime( FALSE );

  // Temporaere Protokoll-Objekte fuer die Inventur-Schleife
  Protokoll.Create( "_PINGProtokoll", TRUE, NULL );
  LetztesProtokoll.Create( "_PINGProtokoll", TRUE, NULL );

  // Zwei Sets: fortlaufende Protokolle + Anhangprotokolle
  ProtokolleSet.Construct( "_PINGProtokoll" );
  AnhangSet.Construct( "_PINGProtokoll" );

  Position = 0;
  FOREACH( Protokoll; Object._Protokolle )
    Position += 1;
    AnzahlElementPositionen += Protokoll._Protokollelemente.GetCount();

    IF( Protokoll._Nummer > 0 )
      nProtokolle += 1;
      IF( Protokoll._Nummer > maxProtokolle )
        maxProtokolle = Protokoll._Nummer;
        PositionNP = Position;
        gefunden = TRUE;
        ProtokolleSet.Add( Protokoll );
        LetztesProtokoll = Protokoll;
      ENDIF
    ELSE
      nAnhang += 1;
      IF( Protokoll._Nummer < maxAnhang )
        maxAnhang = Protokoll._Nummer;
      ENDIF
      AnhangSet.Add( Protokoll );
    ENDIF
  ENDEACH

  // *********************************************************
  // ********  Neues Protokoll mit Daten vorbefuellen  *******
  // Nicht temporaer!
  NeuesProtokoll.Create( "_PINGProtokoll", FALSE, NULL );
  NeuesProtokoll._Datum = T;
  NeuesProtokoll._Nummer = maxProtokolle + 1;
  NeuesProtokoll.SetObject( "_Protokollgruppe", Object );
  NeuesProtokoll._Name = Object._Name + " " + IntToStr( NeuesProtokoll._Nummer ) + " - " + ( T.FormatDateStr( "yyyy" ) );

  IF( gefunden )
    // Daten vom letzten regulaeren Protokoll uebernehmen
    NeuesProtokoll._Autor = LetztesProtokoll._Autor;
    NeuesProtokoll._Ort = LetztesProtokoll._Ort;
    NeuesProtokoll._Signatur = LetztesProtokoll._Signatur;
    NeuesProtokoll._Vorbemerkung = LetztesProtokoll._Vorbemerkung;
    NeuesProtokoll._Nachbemerkung = LetztesProtokoll._Nachbemerkung;
    NeuesProtokoll._Teilnehmer.AddSet( LetztesProtokoll._Teilnehmer );
    NeuesProtokoll._Verteiler.AddSet( LetztesProtokoll._Verteiler );

    // Letzte Protokollelement-Nummer ermitteln (Counter fortschreiben)
    LetztePos = LetztesProtokoll._Protokollelemente[ LetztesProtokoll._Protokollelemente.GetCount() ]._Position;

    // Text-Suffix erkennen: wenn i>1 gibt es einen Vortext (z.B. "A1" -> "A2")
    i = StrFindOneOf( LetztePos.MakeReverse(), "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdeafghikalmnopqrstuvwxyzäöüÄÖÜß.,;:-_#'+-!§$&0", 1 );
    LetztePos.MakeReverse();
    IF( i < 2 )
      Counter = IntToStr( LetztePos.ToInt( 10 ) + 1 );
    ELSE
      IF( i > 1 )
        Counter = LetztePos.Left( LetztePos.GetLength() - i + 1 ) + IntToStr( LetztePos.Right( i - 1 ).ToInt( 10 ) + 1 );
      ENDIF
    ENDIF

    // Erstes Element im neuen Protokoll anlegen
    IF( AnzahlElementPositionen > 0 )
      Element.Create( "_PINGProtokollelement" );
      IF( Object._Name.Find( "Baustelle" ) > 0 )
        Element._Thema = "QM";
        Element._Positionstext = "Folgende Bauteile wurden geprueft: ";
      ENDIF
      Element._Position = Counter;
      Element._Status = 0;
      Element._Protokoll = NeuesProtokoll;
      Element.Store();
      NeuesProtokoll._Protokollelemente.Add( Element );
    ENDIF
  ELSE
    // Kein Vorgaenger gefunden: erstes Element mit Position "1"
    IF( AnzahlElementPositionen == 0 )
      Element.Create( "_PINGProtokollelement" );
      Element._Position = "1";
      Element._Status = 0;
      Element._Protokoll = NeuesProtokoll;
      Element.Store();
      NeuesProtokoll._Protokollelemente.Add( Element );
    ENDIF
  ENDIF

  // *********************************************************
  // ******** Protokolle in die Gruppe schreiben      *******
  ProtokolleSet.Add( NeuesProtokoll );
  ProtokolleSet.AddSet( AnhangSet );

  IF( Object.LockRefresh( WRITE_NOWRITE, FLAT, 1, TRUE ) )
    Object._Protokolle.RemoveAll();
    FOREACH( Protokoll; ProtokolleSet )
      Object._Protokolle.AddObject( Protokoll );
      Object.Store();
    ENDEACH
    Object.StoreUnlock();
  ELSE
    RETURN( 1 );
  ENDIF

  NeuesProtokoll.Store();

RETURN( 0 );
