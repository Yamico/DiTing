Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "pythonw run_worker_tray.py", 0, False
Set WshShell = Nothing
