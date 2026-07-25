; Film2Frame NSIS helpers
; De standaard electron-builder check matcht soms processen waarvan de naam
; "Film2Frame" bevat — o.a. "Film2Frame Setup ….exe" (de installer zelf).
; Wij sluiten alleen het echte app-proces Film2Frame.exe af.

!macro customCheckAppRunning
  DetailPrint "Afsluiten van Film2Frame.exe indien actief..."
  ; Negeer exitcode: "niet gevonden" is ok.
  nsExec::ExecToLog 'cmd /c taskkill /F /IM Film2Frame.exe /T /FI "USERNAME eq %USERNAME%" >nul 2>&1'
  Sleep 600
!macroend
