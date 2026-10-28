"""
Validacao dos destinos de impressora (evita SSRF e escrita em arquivos arbitrarios do servidor).
"""
import ipaddress
import re

ALLOWED_PORTS = {9100, 9101, 9102}
_USB_RE = re.compile(r"^(/dev/usb/lp\d+|/dev/ttyUSB\d+|\\\\\.\\USB\d+)$")
_SERIAL_RE = re.compile(r"^(/dev/tty(USB|ACM|S)\d+|COM\d+)$")


def validate_ip(value):
    if value in (None, ""):
        return value
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        raise ValueError("ip_address deve ser um IP da rede local (sem nome de host)")
    if not ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast:
        raise ValueError("ip_address deve ser um IP privado da rede local da loja")
    return value


def validate_port(value):
    if value is not None and value not in ALLOWED_PORTS:
        raise ValueError("porta nao permitida (use 9100)")
    return value


def validate_usb(value):
    if value not in (None, "") and not _USB_RE.match(value):
        raise ValueError("usb_device invalido")
    return value


def validate_serial(value):
    if value not in (None, "") and not _SERIAL_RE.match(value):
        raise ValueError("serial_port invalido")
    return value
