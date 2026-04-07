// ============================================================================
// PING_ExportAllProjekte_Hub — Alle Projekte als Hub-Format JSON
// ============================================================================
// PING, 02.04.2026, CP (ClaudeCode)
// Introspection-basierter Export aller Projekt-Felder mit Hub-Konventionen:
// - Manifest mit object_type "manifest", version "hub"
// - Jedes Projekt mit object_type "projekt", _oid
// - Objekt-Referenzen: {field}_oid, {field}_name, {field}_kuerzel
// - ObjectSets: {field}_oids
// - ValueSets: {field} als Array
// - TIME: nur wenn nicht leer
// ============================================================================

INT PING_ExportAllProjekte_Hub( HDIALOG Dialog, DBOBJECT &Object )
    HJSON JSon;
    HJSON ManifestJSon;
    HJSON PaketJSon;
    HJSON FieldsJSon;
    HJSON SetArrJSon;
    HFILE File;
    STRING Txt;
    STRING FilePath = "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport\\projekte.json";
    STRING strace = "#### Projekt-Export Hub: ";
    STRING ClassName = "Projekt";

    ProjektAllSet ProjAS;
    ProjektSet ProjS;
    Projekt Proj;

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
    INT ProjCount;
    TIME tNow;

    JSon.Construct();

    // ============================================================
    // INTROSPECTION: Felder ermitteln
    // ============================================================
    DBCGetMembers( ClassName, Members );
    MemberCount = Members.GetCount();
    Trace( strace + "Members fuer %1: %2", ClassName, MemberCount.ToStr() );

    // ============================================================
    // ALLE PROJEKTE LADEN
    // ============================================================
    ProjS.Construct();
    DBASQuery( ProjAS, "query Nummer != \"\";", ProjS );
    ProjCount = ProjS.GetCount();
    Trace( strace + "Anzahl Projekte: %1", ProjCount.ToStr() );

    // ============================================================
    // MANIFEST (erstes Element)
    // ============================================================
    tNow = TimeGetCurrTime( FALSE );
    ManifestJSon = JSon.AddElement();
    ManifestJSon.GetMember( "object_type", TRUE ).SetString( "manifest" );
    ManifestJSon.GetMember( "version", TRUE ).SetString( "hub" );
    ManifestJSon.GetMember( "timestamp", TRUE ).SetString( tNow.EditFormatDateTime() );
    ManifestJSon.GetMember( "count", TRUE ).SetNumber( ProjCount.ToFloat() );
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

    // ============================================================
    // PROJEKTE EXPORTIEREN
    // ============================================================
    IF( ProjS.Get( Proj, 1, START ) )
        REPEAT
            PaketJSon = JSon.AddElement();
            PaketJSon.GetMember( "object_type", TRUE ).SetString( "projekt" );
            PaketJSon.GetMember( "_oid", TRUE ).SetString( Proj.GetOID() );

            FOR( mi = 1; mi <= MemberCount; mi++ )
                MemberName = Members[ mi ];
                isVisible = DBCIsMemberVisible( ClassName, MemberName );
                IF( isVisible )
                    isSet = DBCIsMemberSet( ClassName, MemberName );
                    isObj = DBCIsMemberObject( ClassName, MemberName );
                    IF( !isSet )
                        IF( isObj )
                            // --- Object reference: _oid, _name, _kuerzel ---
                            IF( Proj.GetObject( MemberName, RefObj ) )
                                PaketJSon.GetMember( MemberName + "_oid", TRUE ).SetString( RefObj.GetOID() );
                                // Try Name1, then Name
                                sVal = RefObj.GetString( "Name1" );
                                IF( sVal == "" )
                                    sVal = RefObj.GetString( "Name" );
                                ENDIF
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_name", TRUE ).SetString( sVal );
                                ENDIF
                                // Try Kuerzel
                                sVal = RefObj.GetString( "Kuerzel" );
                                IF( sVal != "" )
                                    PaketJSon.GetMember( MemberName + "_kuerzel", TRUE ).SetString( sVal );
                                ENDIF
                            ENDIF
                        ELSE
                            // --- Scalar fields ---
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                sVal = Proj.GetString( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetString( sVal );
                            ELSEIF( MemberType == "INT" )
                                iVal = Proj.GetInt( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( iVal.ToFloat() );
                            ELSEIF( MemberType == "FLOAT" )
                                fVal = Proj.GetFloat( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetNumber( fVal );
                            ELSEIF( MemberType == "BOOL" )
                                bVal = Proj.GetBool( MemberName );
                                PaketJSon.GetMember( MemberName, TRUE ).SetBool( bVal );
                            ELSEIF( MemberType == "TIME" )
                                tVal = Proj.GetTime( MemberName );
                                IF( !tVal.IsEmpty() )
                                    PaketJSon.GetMember( MemberName, TRUE ).SetString( tVal.EditFormatDateTime() );
                                ENDIF
                            ENDIF
                        ENDIF
                    ELSE
                        // --- Set fields ---
                        IF( isObj )
                            // ObjectSet: export as array of OID strings
                            IF( Proj.GetObjectSet( MemberName, SetObj ) )
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
                            // Value sets: export as array with original field name
                            MemberType = DBCGetMemberTypeName( ClassName, MemberName );
                            IF( MemberType == "STRING" )
                                IF( Proj.GetStringSet( MemberName, StrSetObj ) )
                                    IF( StrSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= StrSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetString( StrSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "INT" )
                                IF( Proj.GetIntSet( MemberName, IntSetObj ) )
                                    IF( IntSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= IntSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( IntSetObj.Get( si ).ToFloat() );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "FLOAT" )
                                IF( Proj.GetFloatSet( MemberName, FloatSetObj ) )
                                    IF( FloatSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= FloatSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetNumber( FloatSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "BOOL" )
                                IF( Proj.GetBoolSet( MemberName, BoolSetObj ) )
                                    IF( BoolSetObj.GetCount() > 0 )
                                        SetArrJSon = PaketJSon.GetMember( MemberName, TRUE );
                                        FOR( si = 1; si <= BoolSetObj.GetCount(); si++ )
                                            SetArrJSon.AddElement().SetBool( BoolSetObj.Get( si ) );
                                        NEXT
                                    ENDIF
                                ENDIF
                            ELSEIF( MemberType == "TIME" )
                                IF( Proj.GetTimeSet( MemberName, TimeSetObj ) )
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

        UNTIL( !ProjS.Get( Proj, 1, CURRENT ) )
    ENDIF

    ProjS.Destruct();

    // ============================================================
    // DATEI SCHREIBEN
    // ============================================================
    Txt = JSon.GetText( TRUE );
    FileCreatePath( "K:\\Sonstige\\Docuframe-Exchange\\data\\dfexport" );
    File.Open( FilePath, FILE_MODE_CREATE | FILE_MODE_WRITE );
    File.WriteString( Txt );
    File.Close();
    JSon.Destruct();

    MessageBox( "Projekt-Export (Hub) abgeschlossen.\n\nDatei: " + FilePath + "\nAnzahl: " + ProjCount.ToStr(), MB_OK | MB_ICONINFORMATION );

RETURN( 0 );
