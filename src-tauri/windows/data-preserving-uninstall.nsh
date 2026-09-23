; Tidy Task data must survive a normal uninstall/reinstall. The stock Tauri NSIS
; script otherwise removes both Roaming and Local app data when its checkbox is
; selected. A user who really wants a reset can use the app's reset flow.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
    MessageBox MB_OK|MB_ICONINFORMATION "Tidy Task will keep your tasks and settings so they can be restored after reinstalling. The 'Delete app data' option is ignored for safety."
  ${EndIf}
  StrCpy $DeleteAppDataCheckboxState 0
!macroend
