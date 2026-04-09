// PING, 02.04.2026, CP (ClaudeCode)
// Batch-Wrapper fuer den Hub-Import: scannt K:\Sonstige\Docuframe-Exchange\data\dfimport\progrp*.json,
// ruft fuer jede Datei den Worker PINGProtGrpImpJSON auf, verschiebt erfolgreiche Dateien nach done/,
// schreibt import.log.
//
// 08.04.2026, User-Korrektur:
//   - Signatur auf BOOL Manual reduziert (HDIALOG/DBOBJECT waren ungenutzt)
//   - EditFormatDateTime(tNow) -> tNow.FormatDateTime() (Instanzmethode)

INT PINGProtGrpImportBatch_Hub( BOOL Manual )

  STRING BasePath = "K:\\Sonstige\\Docuframe-Exchange\\data\\dfimport";
  STRING DonePath;
  STRING LogPath;
  STRING SearchMask;
  STRING FilePath;
  STRING FileName;
  STRING DoneFile;
  STRING JsonText;
  STRING ErrorMsg;
  STRING LogLine;
  STRING Summary;
  STRING TimeStr;
  STRING strace = "#### ProtGrpImportBatch: ";

  HFILEFIND Finder;
  HFILESTATUS Status;
  HFILE DataFile;
  HFILE LogFile;

  TIME tNow;
  INT nFound;
  INT nOk;
  INT nFail;
  INT nEmpty;
  INT rc;
  BOOL bMoved;
  BOOL bOpened;
  BOOL bLogOpened;

  // === Init ===
  nFound = 0;
  nOk = 0;
  nFail = 0;
  nEmpty = 0;
  DonePath = BasePath + "\\done";
  LogPath = BasePath + "\\import.log";
  SearchMask = BasePath + "\\progrp*.json";

  Trace( strace + "Start Scan: %1", SearchMask );

  // Sicherstellen, dass done/ existiert
  FileCreatePath( DonePath );

  // === Scan ===
  Finder.Construct();
  Finder.Start( SearchMask );

  Status.Construct();
  WHILE( Finder.GetNext( Status ) )
    FilePath = Status.GetFullName();

    IF( !FileIsDir( FilePath ) )
      nFound = nFound + 1;
      FileName = FileGetFileName( FilePath, TRUE );

      Trace( strace + "[%1] %2", nFound.ToStr(), FileName );

      // Datei lesen
      JsonText = "";
      bOpened = DataFile.Open( FilePath, FILE_MODE_READ );
      IF( bOpened )
        JsonText = DataFile.ReadText();
        DataFile.Close();
      ENDIF

      IF( JsonText == "" )
        nEmpty = nEmpty + 1;
        LogLine = "LEER oder nicht lesbar: " + FileName;
        Trace( strace + "%1", LogLine );
      ELSE
        // Worker aufrufen
        ErrorMsg = "";
        rc = PINGProtGrpImpJSON( JsonText, ErrorMsg );

        IF( rc == 0 )
          // Erfolg -> nach done/ verschieben
          DoneFile = DonePath + "\\" + FileName;
          bMoved = FileRename( FilePath, DoneFile );
          IF( bMoved )
            nOk = nOk + 1;
            LogLine = "OK: " + FileName;
            Trace( strace + "OK -> done\\%1", FileName );
          ELSE
            nFail = nFail + 1;
            LogLine = "Move nach done fehlgeschlagen: " + FileName;
            Trace( strace + "%1", LogLine );
          ENDIF
        ELSE
          nFail = nFail + 1;
          LogLine = "FEHLER " + FileName + ": " + ErrorMsg;
          Trace( strace + "%1", LogLine );
        ENDIF
      ENDIF

      // Log-Zeile anhaengen
      tNow = TimeGetCurrTime( FALSE );
      TimeStr = tNow.FormatDateTime();
      bLogOpened = LogFile.Open( LogPath, FILE_MODE_WRITE );
      IF( !bLogOpened )
        bLogOpened = LogFile.Open( LogPath, FILE_MODE_CREATE | FILE_MODE_WRITE );
      ELSE
        LogFile.SeekToEnd();
      ENDIF
      IF( bLogOpened )
        LogFile.WriteString( TimeStr + "  " + LogLine + "\r\n" );
        LogFile.Close();
      ENDIF
    ENDIF
  ENDWHILE

  Status.Destruct();
  Finder.Stop();
  Finder.Destruct();

  // === Summary ===
  tNow = TimeGetCurrTime( FALSE );
  TimeStr = tNow.FormatDateTime();

  Summary = "Import-Batch " + TimeStr + "\n\n";
  Summary = Summary + "Gefundene Dateien:  " + nFound.ToStr() + "\n";
  Summary = Summary + "Erfolgreich:        " + nOk.ToStr() + "\n";
  Summary = Summary + "Fehlgeschlagen:     " + nFail.ToStr() + "\n";
  Summary = Summary + "Leer/unlesbar:      " + nEmpty.ToStr() + "\n";

  Trace( strace + "Fertig: ok=%1 fail=%2 empty=%3", nOk.ToStr(), nFail.ToStr(), nEmpty.ToStr() );

  // Abschluss-Log (immer)
  LogLine = "BATCH " + TimeStr + " found=" + nFound.ToStr() + " ok=" + nOk.ToStr() + " fail=" + nFail.ToStr();
  bLogOpened = LogFile.Open( LogPath, FILE_MODE_WRITE );
  IF( !bLogOpened )
    bLogOpened = LogFile.Open( LogPath, FILE_MODE_CREATE | FILE_MODE_WRITE );
  ELSE
    LogFile.SeekToEnd();
  ENDIF
  IF( bLogOpened )
    LogFile.WriteString( TimeStr + "  " + LogLine + "\r\n\r\n" );
    LogFile.Close();
  ENDIF

  // Zusammenfassung anzeigen (bei manuellem Aufruf). Scheduler kann dies
  // ignorieren, weil keine Benutzerinteraktion erfolgt.
  IF( Manual )
    MessageBox( Summary, MB_OK | MB_ICONINFORMATION, 0, "Protokoll-Import" );
  ENDIF

RETURN( 0 )
