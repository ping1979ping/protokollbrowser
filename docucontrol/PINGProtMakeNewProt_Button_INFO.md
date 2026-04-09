# PINGProtMakeNewProt_Button

Click-Button-Wrapper fuer das DOCUframe-Formular einer Protokollgruppe. Ersetzt das alte inline-Button-Makro.

## Signatur

```
INT PINGProtMakeNewProt_Button( HDIALOG Dialog, DBOBJECT &Object )
```

## Ablauf

1. Cast `Object` auf `_PINGProtokollgruppe`
2. **Datums-Dialog:** `T.ShowDateTimeEditDlg(LANGID_GERMAN, FALSE, ...)`. Bei Abbruch → `RETURN(0)`.
3. **`PINGProtMakeNewProt(ProtGrp, NeuesProtokoll)`** — legt das neue Protokoll an (headless, keine UI).
4. **Datum + Name ueberschreiben:** Das headless-Makro hat das heutige Datum gesetzt. Hier wird das vom User gewaehlte Datum und der Name mit korrekter Jahreszahl aus `T` uebernommen.
5. **Erfolgs-MessageBox** ("Neues Protokoll erstellt, bitte anpassen.").
6. **Status-Konvertierung anbieten:** Fuer das vorherige Protokoll (Nummer = NeuesProtokoll._Nummer - 1):
   - Anzahl der Elemente im Status NEU (0) zaehlen → Dialog "auf OFFEN (10) setzen?"
   - Anzahl der Elemente im Status ERLEDIGT(Info) (17) zaehlen → Dialog "auf ERLEDIGT (20) setzen?"
7. **Dialog-Refresh** der Protokoll-Liste + Selektion des neuen Protokolls.

## Abhaengigkeiten

- Ruft `PINGProtMakeNewProt` auf (headless Makro).

## Ersetzt

Das alte inline-Button-Makro (`PINGProtMakeNewProt_20260409_1230.dfm` in `T:\_Temp\CP\DOCUcontrol\`, original aus dem Formular-Event).

## Version

| Version | Datum | Aenderung |
|---|---|---|
| 1.0 | 09.04.2026 | Erstversion — schlanker Wrapper um das benannte Makro |
