"""One-shot deploy script for financial_model_v5.py to the VPS.

Steps:
  1. SSH to root@72.61.226.16
  2. Back up existing /opt/financial-model/financial_model_v5.py to backups/
  3. Upload the local scripts/financial_model_v5.py to /opt/financial-model/
  4. Run `python3 -m py_compile` to verify syntax on the VPS
  5. `systemctl restart financial-model`
  6. Hit /health and print the response

Run from repo root:
    .venv/Scripts/python.exe scripts/deploy_fm_to_vps.py
"""
from __future__ import annotations

import io
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import paramiko

VPS_HOST     = "72.61.226.16"
VPS_USER     = "root"
VPS_PASSWORD = "a0&yKb.,2?wtqh4)/brC"
REMOTE_DIR   = "/opt/financial-model"
LOCAL_FILE   = Path(__file__).resolve().parent / "financial_model_v5.py"


def run(client: paramiko.SSHClient, cmd: str, *, check: bool = True) -> tuple[int, str, str]:
    """Run a remote command. Returns (exit_code, stdout, stderr)."""
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(f"    {out}")
    if err and code != 0 and check:
        print(f"    [stderr] {err}")
    if check and code != 0:
        raise RuntimeError(f"Remote command failed (exit={code}): {cmd}\n{err}")
    return code, out, err


def banner(msg: str) -> None:
    print(f"\n=== {msg} ===")


def main() -> int:
    if not LOCAL_FILE.exists():
        print(f"ERROR: {LOCAL_FILE} not found")
        return 1
    local_size = LOCAL_FILE.stat().st_size
    print(f"Local file: {LOCAL_FILE} ({local_size:,} bytes)")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"\nConnecting to {VPS_USER}@{VPS_HOST} ...")
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASSWORD, timeout=20)
    print("Connected.")

    banner("1. Verify remote layout")
    run(client, f"ls -la {REMOTE_DIR}/financial_model_v5.py")
    run(client, f"mkdir -p {REMOTE_DIR}/backups")

    banner("2. Backup existing script")
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup_path = f"{REMOTE_DIR}/backups/financial_model_v5.py.{ts}.bak"
    run(client, f"cp {REMOTE_DIR}/financial_model_v5.py {backup_path}")
    print(f"   Backup saved to {backup_path}")

    banner("3. Upload new financial_model_v5.py")
    sftp = client.open_sftp()
    remote_path = f"{REMOTE_DIR}/financial_model_v5.py"
    sftp.put(str(LOCAL_FILE), remote_path)
    remote_size = sftp.stat(remote_path).st_size
    sftp.close()
    print(f"   Uploaded {remote_size:,} bytes (local was {local_size:,} bytes)")
    if remote_size != local_size:
        print("   WARNING: size mismatch")

    banner("4. Syntax check on VPS")
    run(client, f"{REMOTE_DIR}/venv/bin/python3 -m py_compile {remote_path}")
    print("   Syntax OK")

    banner("5. Restart systemd service")
    run(client, "systemctl restart financial-model")
    time.sleep(2)
    run(client, "systemctl is-active financial-model")

    banner("6. Health check")
    time.sleep(1)
    code, out, err = run(client, "curl -fsS http://localhost:8500/health", check=False)
    if code != 0:
        print("   Health endpoint not responding yet. Recent journal:")
        run(client, "journalctl -u financial-model -n 30 --no-pager", check=False)

    banner("DEPLOY COMPLETE")
    print(f"\nBackup of old script: {backup_path}")
    print("To regenerate GRAVITA with live Claude pass, run from your local machine:")
    print("  curl -X POST http://72.61.226.16:8500/generate \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"nse_symbol\":\"GRAVITA\",\"company_name\":\"Gravita India Ltd\",\"sector\":\"Metal & Metal Products\"}'")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
