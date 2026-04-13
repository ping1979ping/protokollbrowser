// ============================================================================
// PING_ExportAllAdressen_Hub — Alle Adressen + Ansprechpartner als Hub-Format JSON
// ============================================================================
// PING, 13.04.2026, CP (ClaudeCode)
// Introspection-basierter Export aller Adress-Felder mit Hub-Konventionen:
// - Manifest mit object_type "manifest", version "hub"
// - Jede Adresse mit object_type "adresse", _oid, _klasse (tatsaechliche Unterklasse)
// - Jeder Ansprechpartner mit object_type "ansprechpartner", _oid, _parent_oid
// - Objekt-Referenzen: {field}_oid, {field}_name, {field}_kuerzel
// - ObjectSets: {field}_oids
// - ValueSets: {field} als Array
// - TIME: nur wenn nicht leer
// ============================================================================

INT PING_ExportAllAdressen_Hub( HDIALOG Dialog, DBOBJECT &Object )
    HJSON JSon;
    HJSON ManifestJSon;
    HJSON PaketJSon;
    HJSON FieldsJSon;
    HJSON SetArrJSon;
    HFILE File;
    STRING Txt;
    STRING FilePath = "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport\\adressen.json";
    STRING strace = "#### Adressen-Export Hub: ";
    STRING ClassName;

    // Adresse
    AdresseAllSet AdrAS;
    AdresseSet AdrS;
    Adresse Adr;
    INT AdrCount;

    // Ansprechpartner
    AnsprechpartnerAllSet AspAS;
    AnsprechpartnerSet AspS;
    Ansprechpartner Asp;
    INT AspCount;
    Adresse AspParent;

    // Introspection
    DBSTRINGSET Members;
    INT MemberCount;
    INT mi;
    STRING MemberName;
    STRING MemberType;
    BOOL isSet;
    BOOL isObj;
    BOOL isVisible;

    // Value holders
    STRING sVal;
    STRING sVal2;
    INT iVal;
    FLOAT fVal;
    BOOL bVal;
    TIME tVal;
    DBOBJECT RefObj;
    DBOBJECTSET SetObj;
    DBOBJECT SetItem;
    DBSTRINGSET StrSetObj;
    DBINTSET IntSetObj;
    DBFLOATSET FloatSetObj;
    DBBOOLSET BoolSetObj;
    DBTIMESET TimeSetObj;
    INT si;
    TIME tNow;

    JSon.Construct();

    // ============================================================
    // TEIL 1: ADRESSEN
    // ============================================================
    ClassName = "Adresse";

    // INTROSPECTION: Felder ermitteln
    DBCGetMembers( ClassName, Members );
    MemberCount = Members.GetCount();
    Trace( strace + "Members fuer %1: %2", ClassName, MemberCount.ToStr() );

    // ALLE ADRESSEN LADEN (AdresseAllSet umfasst alle Unterklassen)
    AdrS.Construct();
    DBASQuery( AdrAS, "query Name1 != \"\";", AdrS );
    AdrCount = AdrS.GetCount();
    Trace( strace + "Anzahl Adressen: %1", AdrCount.ToStr() );

    // MANIFEST (erstes Element)
    tNow = TimeGetCurrTime( FALSE );
    ManifestJSon = JSon.AddElement();
    ManifestJSon.GetMember( "object_type", TRUE ).SetString( "manifest" );
    ManifestJSon.GetMember( "version", TRUE ).SetString( "hub" );
    ManifestJSon.GetMember( "timestamp", TRUE ).SetString( tNow.EditFormatDateTime() );
    ManifestJSon.GetMember( "count", TRUE ).SetNumber( AdrCount.ToFloat() );
    ManifestJSon.GetMember( "klasse", TRUE ).SetString( ClassName );

    // Schema-Felder im Manifest
    FieldsJSon = ManifestJSon.GetMember( "_fields", TRUE );
    FOR( mi = 1; mi <= MemberCount; mi++ )
        MemberName = Members[ mi ];
        isVisible = DBCIsMemberVisible( ClassName, MemberName );
        IF( isVisible )
            isSet = DBCIsMemberSet( ClassName, MemberName );
            isObj = DBCIsMemberObject( ClassName, MemberName );
            IF( isSet )
                MemberType = "SET:" + DBCGetMemberTypeName( ClassName, MemberName );
            ELSEIF( isObj )
                MemberType = "OBJECT:" + DBCGetMemberTypeName( ClassName, MemberName );
            ELSE
                MemberType = DBCGetMemberTypeName( ClassName, MemberName );
            ENDIF
            FieldsJSon.GetMember( MemberName, TRUE ).SetString( MemberType );
        ENDIF
    NEXT

    // ADRESSEN EXPORTIEREN
    IF( AdrS.Get( Adr, 1, START ) )
        REPEAT
            PaketJSon = JSon.AddElement();
            PaketJSon.GetMember( "object_type", TRUE ).SetString( "adresse" );
            PaketJSon.GetMember( "_oid", TRUE ).SetString( Adr.GetOID() );
            PaketJSon.GetMember( "_klasse", TRUE ).SetString( Adr.GetClassName() );

            FOR( mi = 1; mi <= MemberCount; mi++ )
                MemberName = Members[ mi ];
                isVisible = DBCIsMemberVisible( ClassName, MemberName );
                IF( isVisible )
                    isSet = DBCIsMemberSet( ClassName, MemberName );
                    isObj = DBCIsMemberObject( ClassName, MemberName );
                    IF( !isSet )
                        IF( isObj )
                            // --- Object reference: _oid, _name, _kuerzel ---
                            IF( Adr.GetObject( MemberName, RefObj ) )
                                PaketJSon.GetMember( MemberName + "_oid", TRUE ).SetString( RefObj.GetOID() );
                                sVal = RefObj.GetString( "Name1" );
                                IF( sVal == "" )
                                    sVal = RefObj.GetString( "Name" );
                                ENDIF
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_name", TRUE ).SetString( sVal );
                                ENDIF
                                sVal = RefObj.GetString( "Kuerzel" );
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_kuerzel", TRUE ).SetString( sVal );
                                ENDIF
                            ENDIF
                        ELSE
                            // --- Scalar fields ---
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                sVal = Adr.GetString( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetString( sVal );
                            ELSEIF( MemberType == "INT" )
                                iVal = Adr.GetInt( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( iVal.ToFloat() );
                            ELSEIF( MemberType == "FLOAT" )
                                fVal = Adr.GetFloat( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( fVal );
                            ELSEIF( MemberType == "BOOL" )
                                bVal = Adr.GetBool( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetBool( bVal );
                            ELSEIF( MemberType == "TIME" )
                                tVal = Adr.GetTime( MemberName );
                                IF( !tVal.IsEmpty() )
                                    PaketJSon.GetMember( MemberName, TRUE ).SetString( tVal.EditFormatDateTime() );
                                ENDIF
                            ENDIF
                        ENDIF
                    ELSE
                        // --- Set fields ---
                        IF( isObj )
                            IF( Adr.GetObjectSet( MemberName, SetObj ) )
                                IF( SetObj.GetCount() > 0 )
                                    SetArrJSon = PaketJSon.GetMember( MemberName + "_oids", TRUE );
                                    IF( SetObj.Get( SetItem, 1, START ) )
                                        REPEAT
                                            SetArrJSon.AddElement().SetString( SetItem.GetOID() );
                                        UNTIL( !SetObj.Get( SetItem, 1, CURRENT ) )
                                    ENDIF
                                ENDIF
                            ENDIF
                        ELSE
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                IF( Adr.GetStringSet( MemberName, StrSetObj ) )
                                    IF( StrSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= StrSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetString( StrSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "INT" )
                                IF( Adr.GetIntSet( MemberName, IntSetObj ) )
                                    IF( IntSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= IntSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( IntSetObj.Get( si ).ToFloat() );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "FLOAT" )
                                IF( Adr.GetFloatSet( MemberName, FloatSetObj ) )
                                    IF( FloatSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= FloatSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( FloatSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "BOOL" )
                                IF( Adr.GetBoolSet( MemberName, BoolSetObj ) )
                                    IF( BoolSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= BoolSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetBool( BoolSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "TIME" )
                                IF( Adr.GetTimeSet( MemberName, TimeSetObj ) )
                                    IF( TimeSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
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
            NEXT

        UNTIL( !AdrS.Get( Adr, 1, CURRENT ) )
    ENDIF

    AdrS.Destruct();

    // ============================================================
    // TEIL 2: ANSPRECHPARTNER
    // ============================================================
    ClassName = "Ansprechpartner";

    // INTROSPECTION: Felder ermitteln
    DBCGetMembers( ClassName, Members );
    MemberCount = Members.GetCount();
    Trace( strace + "Members fuer %1: %2", ClassName, MemberCount.ToStr() );

    // ALLE ANSPRECHPARTNER LADEN
    AspS.Construct();
    DBASQuery( AspAS, "query Nummer != \"\";", AspS );
    AspCount = AspS.GetCount();
    Trace( strace + "Anzahl Ansprechpartner: %1", AspCount.ToStr() );

    // MANIFEST fuer Ansprechpartner (zweites Manifest im Array)
    ManifestJSon = JSon.AddElement();
    ManifestJSon.GetMember( "object_type", TRUE ).SetString( "manifest_ansprechpartner" );
    ManifestJSon.GetMember( "version", TRUE ).SetString( "hub" );
    ManifestJSon.GetMember( "timestamp", TRUE ).SetString( tNow.EditFormatDateTime() );
    ManifestJSon.GetMember( "count", TRUE ).SetNumber( AspCount.ToFloat() );
    ManifestJSon.GetMember( "klasse", TRUE ).SetString( ClassName );

    // Schema-Felder im Manifest
    FieldsJSon = ManifestJSon.GetMember( "_fields", TRUE );
    FOR( mi = 1; mi <= MemberCount; mi++ )
        MemberName = Members[ mi ];
        isVisible = DBCIsMemberVisible( ClassName, MemberName );
        IF( isVisible )
            isSet = DBCIsMemberSet( ClassName, MemberName );
            isObj = DBCIsMemberObject( ClassName, MemberName );
            IF( isSet )
                MemberType = "SET:" + DBCGetMemberTypeName( ClassName, MemberName );
            ELSEIF( isObj )
                MemberType = "OBJECT:" + DBCGetMemberTypeName( ClassName, MemberName );
            ELSE
                MemberType = DBCGetMemberTypeName( ClassName, MemberName );
            ENDIF
            FieldsJSon.GetMember( MemberName, TRUE ).SetString( MemberType );
        ENDIF
    NEXT

    // ANSPRECHPARTNER EXPORTIEREN
    IF( AspS.Get( Asp, 1, START ) )
        REPEAT
            PaketJSon = JSon.AddElement();
            PaketJSon.GetMember( "object_type", TRUE ).SetString( "ansprechpartner" );
            PaketJSon.GetMember( "_oid", TRUE ).SetString( Asp.GetOID() );

            // Parent-Adresse (Ansprechpartner.Adresse)
            IF( Asp.GetObject( "Adresse", AspParent ) )
                PaketJSon.GetMember( "_parent_oid", TRUE ).SetString( AspParent.GetOID() );
                sVal = AspParent.GetString( "Name1" );
                IF( sVal != "" )
                    PaketJSon.GetMember( "_parent_name", TRUE ).SetString( sVal );
                ENDIF
            ENDIF

            FOR( mi = 1; mi <= MemberCount; mi++ )
                MemberName = Members[ mi ];
                isVisible = DBCIsMemberVisible( ClassName, MemberName );
                IF( isVisible )
                    isSet = DBCIsMemberSet( ClassName, MemberName );
                    isObj = DBCIsMemberObject( ClassName, MemberName );
                    IF( !isSet )
                        IF( isObj )
                            // --- Object reference: _oid, _name, _kuerzel ---
                            IF( Asp.GetObject( MemberName, RefObj ) )
                                PaketJSon.GetMember( MemberName + "_oid", TRUE ).SetString( RefObj.GetOID() );
                                sVal = RefObj.GetString( "Name1" );
                                IF( sVal == "" )
                                    sVal = RefObj.GetString( "Name" );
                                ENDIF
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_name", TRUE ).SetString( sVal );
                                ENDIF
                                sVal = RefObj.GetString( "Kuerzel" );
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_kuerzel", TRUE ).SetString( sVal );
                                ENDIF
                            ENDIF
                        ELSE
                            // --- Scalar fields ---
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                sVal = Asp.GetString( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetString( sVal );
                            ELSEIF( MemberType == "INT" )
                                iVal = Asp.GetInt( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( iVal.ToFloat() );
                            ELSEIF( MemberType == "FLOAT" )
                                fVal = Asp.GetFloat( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( fVal );
                            ELSEIF( MemberType == "BOOL" )
                                bVal = Asp.GetBool( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetBool( bVal );
                            ELSEIF( MemberType == "TIME" )
                                tVal = Asp.GetTime( MemberName );
                                IF( !tVal.IsEmpty() )
                                    PaketJSon.GetMember( MemberName, TRUE ).SetString( tVal.EditFormatDateTime() );
                                ENDIF
                            ENDIF
                        ENDIF
                    ELSE
                        // --- Set fields ---
                        IF( isObj )
                            IF( Asp.GetObjectSet( MemberName, SetObj ) )
                                IF( SetObj.GetCount() > 0 )
                                    SetArrJSon = PaketJSon.GetMember( MemberName + "_oids", TRUE );
                                    IF( SetObj.Get( SetItem, 1, START ) )
                                        REPEAT
                                            SetArrJSon.AddElement().SetString( SetItem.GetOID() );
                                        UNTIL( !SetObj.Get( SetItem, 1, CURRENT ) )
                                    ENDIF
                                ENDIF
                            ENDIF
                        ELSE
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                IF( Asp.GetStringSet( MemberName, StrSetObj ) )
                                    IF( StrSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= StrSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetString( StrSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "INT" )
                                IF( Asp.GetIntSet( MemberName, IntSetObj ) )
                                    IF( IntSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= IntSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( IntSetObj.Get( si ).ToFloat() );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "FLOAT" )
                                IF( Asp.GetFloatSet( MemberName, FloatSetObj ) )
                                    IF( FloatSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= FloatSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( FloatSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "BOOL" )
                                IF( Asp.GetBoolSet( MemberName, BoolSetObj ) )
                                    IF( BoolSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= BoolSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetBool( BoolSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "TIME" )
                                IF( Asp.GetTimeSet( MemberName, TimeSetObj ) )
                                    IF( TimeSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
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
            NEXT

        UNTIL( !AspS.Get( Asp, 1, CURRENT ) )
    ENDIF

    AspS.Destruct();

    // ============================================================
    // DATEI SCHREIBEN
    // ============================================================
    Txt = JSon.GetText( TRUE );
    FileCreatePath( "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport" );
    File.Open( FilePath, FILE_MODE_CREATE | FILE_MODE_WRITE );
    File.WriteString( Txt );
    File.Close();
    JSon.Destruct();

    MessageBox( "Adressen-Export (Hub) abgeschlossen.\n\nDatei: " + FilePath + "\nAdressen: " + AdrCount.ToStr() + "\nAnsprechpartner: " + AspCount.ToStr(), MB_OK | MB_ICONINFORMATION );

RETURN( 0 );
