"""
Selbstsigniertes SSL-Zertifikat für den Exchange Server erzeugen.

Verwendung:
    python generate_cert.py            # Erzeugt cert.pem + key.pem
    python generate_cert.py --force    # Überschreibt vorhandene Dateien

Das Zertifikat enthält den Hostnamen und alle IPv4-Adressen als SAN
(Subject Alternative Name), damit Browser-Warnungen minimal bleiben.
"""

import os
import socket
import subprocess
import sys
from pathlib import Path


def get_local_ips():
    """Alle lokalen IPv4-Adressen ermitteln."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    ips.add("127.0.0.1")
    return sorted(ips)


def generate_with_openssl(cert_path: Path, key_path: Path):
    """Zertifikat mit openssl-CLI erzeugen."""
    hostname = socket.gethostname()
    ips = get_local_ips()

    # SAN-Einträge: DNS + alle IPs
    san_entries = [f"DNS:{hostname}"]
    san_entries.extend(f"IP:{ip}" for ip in ips)
    san = ",".join(san_entries)

    cmd = [
        "openssl", "req",
        "-x509",
        "-newkey", "rsa:2048",
        "-keyout", str(key_path),
        "-out", str(cert_path),
        "-days", "3650",
        "-nodes",
        "-subj", f"/CN={hostname}",
        "-addext", f"subjectAltName={san}",
    ]

    subprocess.run(cmd, check=True)


def generate_with_cryptography(cert_path: Path, key_path: Path):
    """Zertifikat mit der cryptography-Bibliothek erzeugen."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    import datetime
    import ipaddress

    hostname = socket.gethostname()
    ips = get_local_ips()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, hostname),
    ])

    san_names = [x509.DNSName(hostname)]
    for ip in ips:
        san_names.append(x509.IPAddress(ipaddress.ip_address(ip)))

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san_names), critical=False)
        .sign(key, hashes.SHA256())
    )

    key_path.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def main():
    script_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
    cert_path = script_dir / "cert.pem"
    key_path = script_dir / "key.pem"
    force = "--force" in sys.argv

    if cert_path.exists() and key_path.exists() and not force:
        print(f"Zertifikat existiert bereits: {cert_path}")
        print("Zum Ueberschreiben: python generate_cert.py --force")
        return

    hostname = socket.gethostname()
    ips = get_local_ips()
    print(f"Hostname: {hostname}")
    print(f"IP-Adressen: {', '.join(ips)}")
    print()

    # Versuch 1: openssl-CLI
    try:
        subprocess.run(["openssl", "version"], capture_output=True, check=True)
        print("Erzeuge Zertifikat mit openssl...")
        generate_with_openssl(cert_path, key_path)
        print()
        print(f"Fertig! Dateien erzeugt:")
        print(f"  {cert_path}")
        print(f"  {key_path}")
        return
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    # Versuch 2: cryptography-Bibliothek
    try:
        import cryptography  # noqa: F401
        print("Erzeuge Zertifikat mit cryptography...")
        generate_with_cryptography(cert_path, key_path)
        print()
        print(f"Fertig! Dateien erzeugt:")
        print(f"  {cert_path}")
        print(f"  {key_path}")
        return
    except ImportError:
        pass

    # Nichts verfügbar
    print("FEHLER: Weder openssl noch cryptography gefunden.")
    print()
    print("Loesung A: OpenSSL installieren (z.B. mit Git for Windows mitgeliefert)")
    print("Loesung B: pip install cryptography")
    sys.exit(1)


if __name__ == "__main__":
    main()
