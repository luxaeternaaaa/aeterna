!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$SMPROGRAMS\Aeterna"
  CreateShortcut "$SMPROGRAMS\Aeterna\Aeterna.lnk" "$INSTDIR\Aeterna.exe"
  CreateShortcut "$DESKTOP\Aeterna.lnk" "$INSTDIR\Aeterna.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\Aeterna\Aeterna.lnk"
  RMDir "$SMPROGRAMS\Aeterna"
  Delete "$DESKTOP\Aeterna.lnk"
!macroend
