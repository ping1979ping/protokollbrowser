// ============================================================================
// PING_ExportKlasse — Universeller DOCUframe-Klassen-Exporter (Hub-Format)
// ============================================================================
// PING, 13.04.2026, CP (ClaudeCode)
// Exportiert ALLE Objekte einer beliebigen Klasse als paginierte JSON-Dateien.
// Introspection-basiert: erkennt Felder, Typen, Referenzen automatisch.
// BINARY-Felder werden uebersprungen (nur OID als Verweis).
//
// KONFIGURATION: ClassName, PageSize und BaseDir unten anpassen.
// Ausgabe: BaseDir\{ClassName}_001.json, _002.json, ...
// ============================================================================

INT PING_ExportKlasse( HDIALOG Dialog, DBOBJECT &Object )

    // =======================================================================
    // KONFIGURATION — hier aendern
    // =======================================================================
    STRING ClassName = "Termin";
    INT PageSize = 500;
    STRING BaseDir = "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport\\extract";

    // =======================================================================
    // VARIABLEN
    // =======================================================================

    // Datenbank
    DBALLSET AS;
    DBOBJECT Obj;

    // JSON
    HJSON PageJSon;
    HJSON ManifestJSon;
    HJSON ObjJSon;
    HJSON FieldsJSon;
    HJSON SetArrJSon;

    // Datei
    HFILE File;
    STRING FilePath;
    STRING Txt;
    STRING strace = "#### ExportKlasse: ";

    // Introspection
    DBSTRINGSET Members;
    INT MemberCount;
    INT mi;
    STRING MemberName;
    STRING MemberType;
    BOOL isSet;
    BOOL isObj;
    BOOL isVisible;

    // Value holders (Scalar)
    STRING sVal;
    INT iVal;
    FLOAT fVal;
    BOOL bVal;
    TIME tVal;

    // Value holders (Referenzen)
    DBOBJECT RefObj;
    DBOBJECTSET SetObj;
    DBOBJECT SetItem;

    // Value holders (Wertlisten-Sets)
    DBSTRINGSET StrSetObj;
    DBINTSET IntSetObj;
    DBFLOATSET FloatSetObj;
    DBBOOLSET BoolSetObj;
    DBTIMESET TimeSetObj;
    INT si;

    // Pagination & Fortschritt
    TIME tNow;
    INT Total;
    INT GlobalIdx;
    INT ObjInPage;
    INT PageNum;
    STRING PageNumStr;
    INT PosVal;
    INT TotalPages;

    // =======================================================================
    // START
    // =======================================================================
    tNow = TimeGetCurrTime( FALSE );

    // Introspection: Felder der Klasse ermitteln
    DBCGetMembers( ClassName, Members );
    MemberCount = Members.GetCount();
    Trace( strace + "Klasse: %1, Members: %2", ClassName, MemberCount.ToStr() );

    // Alle Objekte laden
    AS.Construct( ClassName );
    Total = AS.GetCount();
    Trace( strace + "Anzahl Objekte: %1", Total.ToStr() );

    IF( Total > 0 )

        // Seitenanzahl berechnen
        TotalPages = Total / PageSize;
        IF( Total - TotalPages * PageSize > 0 )
            TotalPages = TotalPages + 1;
        ENDIF

        // Ausgabeverzeichnis erstellen
        FileCreatePath( BaseDir );

        // Fortschrittsanzeige starten
        WorkDlgBeginProgress( "Export: " + ClassName + " (" + Total.ToStr() + " Objekte, " + TotalPages.ToStr() + " Seiten)" );

        // Erste Seite initialisieren
        PageNum = 1;
        ObjInPage = 0;
        GlobalIdx = 0;
        PageJSon.Construct();

        // --- Manifest (erstes Element jeder Seite) ---
        ManifestJSon = PageJSon.AddElement();
        ManifestJSon.GetMember( "object_type", TRUE ).SetString( "manifest" );
        ManifestJSon.GetMember( "version", TRUE ).SetString( "hub" );
        ManifestJSon.GetMember( "klasse", TRUE ).SetString( ClassName );
        ManifestJSon.GetMember( "timestamp", TRUE ).SetString( tNow.EditFormatDateTime() );
        ManifestJSon.GetMember( "total_count", TRUE ).SetNumber( Total.ToFloat() );
        ManifestJSon.GetMember( "total_pages", TRUE ).SetNumber( TotalPages.ToFloat() );
        ManifestJSon.GetMember( "page", TRUE ).SetNumber( PageNum.ToFloat() );
        ManifestJSon.GetMember( "page_size", TRUE ).SetNumber( PageSize.ToFloat() );

        // Schema-Felder im Manifest (nur auf Seite 1)
        FieldsJSon = ManifestJSon.GetMember( "_fields", TRUE );
        FOR( mi = 1; mi <= MemberCount; mi++ )
            MemberName = Members[ mi ];
            isVisible = DBCIsMemberVisible( ClassName, MemberName );
            IF( isVisible )
                MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                IF( MemberType != "BINARY" )
                    isSet = DBCIsMemberSet( ClassName, MemberName );
                    isObj = DBCIsMemberObject( ClassName, MemberName );
                    IF( isSet )
                        FieldsJSon.GetMember( MemberName, TRUE ).SetString( "SET:" + MemberType );
                    ELSEIF( isObj )
                        FieldsJSon.GetMember( MemberName, TRUE ).SetString( "OBJECT:" + MemberType );
                    ELSE
                        FieldsJSon.GetMember( MemberName, TRUE ).SetString( MemberType );
                    ENDIF
                ENDIF
            ENDIF
        NEXT

        // ===============================================================
        // OBJEKTE EXPORTIEREN
        // ===============================================================
        IF( AS.Get( Obj, 1, START ) )
            REPEAT
                GlobalIdx = GlobalIdx + 1;
                ObjInPage = ObjInPage + 1;

                // --- Objekt-Record ---
                ObjJSon = PageJSon.AddElement();
                ObjJSon.GetMember( "object_type", TRUE ).SetString( ClassName );
                ObjJSon.GetMember( "_oid", TRUE ).SetString( Obj.GetOID() );
                ObjJSon.GetMember( "_klasse", TRUE ).SetString( Obj.GetClassName() );

                // --- Felder per Introspection ---
                FOR( mi = 1; mi <= MemberCount; mi++ )
                    MemberName = Members[ mi ];
                    isVisible = DBCIsMemberVisible( ClassName, MemberName );
                    IF( isVisible )
                        MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                        IF( MemberType != "BINARY" )
                            isSet = DBCIsMemberSet( ClassName, MemberName );
                            isObj = DBCIsMemberObject( ClassName, MemberName );

                            IF( !isSet )
                                IF( isObj )
                                    // --- Objekt-Referenz: _oid, _name, _kuerzel ---
                                    IF( Obj.GetObject( MemberName, RefObj ) )
                                        ObjJSon.GetMember( MemberName + "_oid", TRUE ).SetString( RefObj.GetOID() );
                                        sVal = RefObj.GetString( "Name1" );
                                        IF( sVal == "" )
                                            sVal = RefObj.GetString( "Name" );
                                        ENDIF
                                        IF( sVal == "" )
                                            sVal = RefObj.GetString( "Betreff" );
                                        ENDIF
                                        IF( sVal != "" )
                                            ObjJSon.GetMember( MemberName + "_name", TRUE ).SetString( sVal );
                                        ENDIF
                                        sVal = RefObj.GetString( "Kuerzel" );
                                        IF( sVal != "" )
                                            ObjJSon.GetMember( MemberName + "_kuerzel", TRUE ).SetString( sVal );
                                        ENDIF
                                    ENDIF
                                ELSE
                                    // --- Skalar-Felder ---
                                    IF( MemberType == "STRING" )
                                        sVal = Obj.GetString( MemberName );
                                        ObjJSon.GetMember( MemberName, TRUE ).SetString( sVal );
                                    ELSEIF( MemberType == "INT" )
                                        iVal = Obj.GetInt( MemberName );
                                        ObjJSon.GetMember( MemberName, TRUE ).SetNumber( iVal.ToFloat() );
                                    ELSEIF( MemberType == "FLOAT" )
                                        fVal = Obj.GetFloat( MemberName );
                                        ObjJSon.GetMember( MemberName, TRUE ).SetNumber( fVal );
                                    ELSEIF( MemberType == "BOOL" )
                                        bVal = Obj.GetBool( MemberName );
                                        ObjJSon.GetMember( MemberName, TRUE ).SetBool( bVal );
                                    ELSEIF( MemberType == "TIME" )
                                        tVal = Obj.GetTime( MemberName );
                                        IF( !tVal.IsEmpty() )
                                            ObjJSon.GetMember( MemberName, TRUE ).SetString( tVal.EditFormatDateTime() );
                                        ENDIF
                                    ENDIF
                                ENDIF
                            ELSE
                                // --- Set-Felder ---
                                IF( isObj )
                                    // ObjectSet: nur OIDs exportieren
                                    IF( Obj.GetObjectSet( MemberName, SetObj ) )
                                        IF( SetObj.GetCount() > 0 )
                                            SetArrJSon = ObjJSon.GetMember( MemberName + "_oids", TRUE );
                                            IF( SetObj.Get( SetItem, 1, START ) )
                                                REPEAT
                                                    SetArrJSon.AddElement().SetString( SetItem.GetOID() );
                                                UNTIL( !SetObj.Get( SetItem, 1, CURRENT ) )
                                            ENDIF
                                        ENDIF
                                    ENDIF
                                ELSE
                                    // Wertlisten-Sets
                                    IF( MemberType == "STRING" )
                                        IF( Obj.GetStringSet( MemberName, StrSetObj ) )
                                            IF( StrSetObj.GetCount() > 0 )
                                                SetArrJSon = ObjJSon.GetMember( MemberName, TRUE );
                                                FOR( si = 1; si <= StrSetObj.GetCount(); si++ )
                                                    SetArrJSon.AddElement().SetString( StrSetObj.Get( si ) );
                                                NEXT
                                            ENDIF
                                        ENDIF
                                    ELSEIF( MemberType == "INT" )
                                        IF( Obj.GetIntSet( MemberName, IntSetObj ) )
                                            IF( IntSetObj.GetCount() > 0 )
                                                SetArrJSon = ObjJSon.GetMember( MemberName, TRUE );
                                                FOR( si = 1; si <= IntSetObj.GetCount(); si++ )
                                                    SetArrJSon.AddElement().SetNumber( IntSetObj.Get( si ).ToFloat() );
                                                NEXT
                                            ENDIF
                                        ENDIF
                                    ELSEIF( MemberType == "FLOAT" )
                                        IF( Obj.GetFloatSet( MemberName, FloatSetObj ) )
                                            IF( FloatSetObj.GetCount() > 0 )
                                                SetArrJSon = ObjJSon.GetMember( MemberName, TRUE );
                                                FOR( si = 1; si <= FloatSetObj.GetCount(); si++ )
                                                    SetArrJSon.AddElement().SetNumber( FloatSetObj.Get( si ) );
                                                NEXT
                                            ENDIF
                                        ENDIF
                                    ELSEIF( MemberType == "BOOL" )
                                        IF( Obj.GetBoolSet( MemberName, BoolSetObj ) )
                                            IF( BoolSetObj.GetCount() > 0 )
                                                SetArrJSon = ObjJSon.GetMember( MemberName, TRUE );
                                                FOR( si = 1; si <= BoolSetObj.GetCount(); si++ )
                                                    SetArrJSon.AddElement().SetBool( BoolSetObj.Get( si ) );
                                                NEXT
                                            ENDIF
                                        ENDIF
                                    ELSEIF( MemberType == "TIME" )
                                        IF( Obj.GetTimeSet( MemberName, TimeSetObj ) )
                                            IF( TimeSetObj.GetCount() > 0 )
                                                SetArrJSon = ObjJSon.GetMember( MemberName, TRUE );
                                                FOR( si = 1; si <= TimeSetObj.GetCount(); si++ )
                                                    tVal = TimeSetObj.Get( si );
                                                    IF( !tVal.IsEmpty() )
                                                        SetArrJSon.AddElement().SetString( tVal.EditFormatDateTime() );
                                                    ENDIF
                                                NEXT
                                            ENDIF
                                        ENDIF
                                    ENDIF
                                ENDIF
                            ENDIF
                        ENDIF
                    ENDIF
                NEXT

                // --- Fortschritt aktualisieren ---
                PosVal = FloatToInt( IntToFloat( GlobalIdx ) / IntToFloat( Total ) * 1000.0 );
                WorkDlgSetPos( PosVal );
                WorkDlgSetText( ClassName + ": " + GlobalIdx.ToStr() + " / " + Total.ToStr() + "  (Seite " + PageNum.ToStr() + "/" + TotalPages.ToStr() + ")" );

                // --- Seite voll? Datei schreiben, neue Seite starten ---
                IF( ObjInPage >= PageSize )
                    Txt = PageJSon.GetText( TRUE );
                    PageNumStr = "000" + PageNum.ToStr();
                    PageNumStr = PageNumStr.Right( 3 );
                    FilePath = BaseDir + "\\" + ClassName + "_" + PageNumStr + ".json";
                    File.Open( FilePath, FILE_MODE_CREATE | FILE_MODE_WRITE );
                    File.WriteString( Txt );
                    File.Close();
                    PageJSon.Destruct();
                    Trace( strace + "Seite %1 geschrieben: %2", PageNum.ToStr(), FilePath );

                    // Naechste Seite vorbereiten
                    PageNum = PageNum + 1;
                    ObjInPage = 0;
                    PageJSon.Construct();

                    ManifestJSon = PageJSon.AddElement();
                    ManifestJSon.GetMember( "object_type", TRUE ).SetString( "manifest" );
                    ManifestJSon.GetMember( "version", TRUE ).SetString( "hub" );
                    ManifestJSon.GetMember( "klasse", TRUE ).SetString( ClassName );
                    ManifestJSon.GetMember( "timestamp", TRUE ).SetString( tNow.EditFormatDateTime() );
                    ManifestJSon.GetMember( "total_count", TRUE ).SetNumber( Total.ToFloat() );
                    ManifestJSon.GetMember( "total_pages", TRUE ).SetNumber( TotalPages.ToFloat() );
                    ManifestJSon.GetMember( "page", TRUE ).SetNumber( PageNum.ToFloat() );
                    ManifestJSon.GetMember( "page_size", TRUE ).SetNumber( PageSize.ToFloat() );
                ENDIF

            UNTIL( !AS.Get( Obj, 1, CURRENT ) )
        ENDIF

        // --- Letzte (unvollstaendige) Seite schreiben ---
        IF( ObjInPage > 0 )
            Txt = PageJSon.GetText( TRUE );
            PageNumStr = "000" + PageNum.ToStr();
            PageNumStr = PageNumStr.Right( 3 );
            FilePath = BaseDir + "\\" + ClassName + "_" + PageNumStr + ".json";
            File.Open( FilePath, FILE_MODE_CREATE | FILE_MODE_WRITE );
            File.WriteString( Txt );
            File.Close();
            Trace( strace + "Seite %1 geschrieben: %2 (letzte, %3 Objekte)", PageNum.ToStr(), FilePath, ObjInPage.ToStr() );
        ENDIF

        PageJSon.Destruct();
        WorkDlgEnd();

    ENDIF

    AS.Destruct();

    // =======================================================================
    // ERGEBNIS
    // =======================================================================
    IF( Total > 0 )
        MessageBox( "Export abgeschlossen: " + ClassName + "\n\nObjekte: " + Total.ToStr() + "\nSeiten: " + PageNum.ToStr() + " (je " + PageSize.ToStr() + ")\nVerzeichnis: " + BaseDir, MB_OK | MB_ICONINFORMATION );
    ELSE
        MessageBox( "Keine Objekte der Klasse '" + ClassName + "' gefunden.", MB_OK | MB_ICONINFORMATION );
    ENDIF

RETURN( 0 );
