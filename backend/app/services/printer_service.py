"""
Serviço de comunicação com impressora de etiquetas.

Suporta três modos de conexão:
  - ETHERNET: socket TCP na porta 9100 (padrão ZPL/Zebra)
  - USB:      escrita direta no device (/dev/usb/lp0 Linux | \\\\.\\ porta RAW Windows)
  - SERIAL:   porta COM via pyserial

Aceita tanto str (ZPL, CPCL) quanto bytes (ESC/POS).

Uso:
    result = await printer_service.print_label(printer, data)
    result = await printer_service.test_connection(printer, test_data)
"""
from __future__ import annotations

import asyncio
import logging
import socket
import sys
from typing import TYPE_CHECKING, Union

if TYPE_CHECKING:
    from app.models.label_printer import LabelPrinter

from app.models.label_printer import ConnectionType

logger = logging.getLogger(__name__)

# Timeout padrão para socket TCP (segundos)
TCP_TIMEOUT = 10
# Tamanho do buffer de leitura de resposta (alguns modelos retornam status)
READ_BUFFER = 1024


LabelData = Union[str, bytes]


class PrinterService:
    """Envia dados de impressão (ZPL str, CPCL str ou ESC/POS bytes) para impressora de etiquetas."""

    async def print_label(self, printer: "LabelPrinter", data: LabelData) -> tuple[bool, str]:
        """
        Envia dados para a impressora.

        Aceita str (ZPL/CPCL) ou bytes (ESC/POS).

        Returns:
            (success, message)
        """
        try:
            if printer.connection_type == ConnectionType.ETHERNET:
                return await self._print_ethernet(printer, data)
            elif printer.connection_type == ConnectionType.USB:
                return await self._print_usb(printer, data)
            elif printer.connection_type == ConnectionType.SERIAL:
                return await self._print_serial(printer, data)
            else:
                return False, f"Tipo de conexão não suportado: {printer.connection_type}"
        except Exception as e:
            logger.error("Erro ao imprimir na impressora %s: %s", printer.name, e)
            return False, str(e)

    async def print_zpl(self, printer: "LabelPrinter", data: LabelData) -> tuple[bool, str]:
        """Alias de print_label para compatibilidade."""
        return await self.print_label(printer, data)

    async def test_connection(self, printer: "LabelPrinter", test_data: LabelData) -> tuple[bool, str]:
        """Testa a conexão imprimindo uma etiqueta de teste."""
        return await self.print_label(printer, test_data)

    # -----------------------------------------------------------------------
    # Ethernet (TCP porta 9100 — padrão ZPL/Zebra/Elgin)
    # -----------------------------------------------------------------------

    async def _print_ethernet(self, printer: "LabelPrinter", data: LabelData) -> tuple[bool, str]:
        if not printer.ip_address:
            return False, "IP não configurado para conexão Ethernet."

        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None, self._send_tcp, printer.ip_address, printer.port, data
            )
            return result
        except Exception as e:
            return False, f"Erro TCP: {e}"

    def _send_tcp(self, host: str, port: int, data: LabelData) -> tuple[bool, str]:
        """Conecta via TCP e envia dados (síncrono — executado em executor)."""
        raw = data if isinstance(data, bytes) else data.encode("utf-8")
        try:
            with socket.create_connection((host, port), timeout=TCP_TIMEOUT) as sock:
                sock.sendall(raw)
            logger.info("Dados enviados via TCP → %s:%s (%d bytes)", host, port, len(raw))
            return True, "Impresso com sucesso via Ethernet."
        except socket.timeout:
            return False, f"Timeout ao conectar em {host}:{port}. Verifique se a impressora está ligada e na rede."
        except ConnectionRefusedError:
            return False, f"Conexão recusada em {host}:{port}. Verifique o IP e a porta da impressora."
        except OSError as e:
            return False, f"Erro de rede: {e}"

    # -----------------------------------------------------------------------
    # USB (escrita direta no device)
    # -----------------------------------------------------------------------

    async def _print_usb(self, printer: "LabelPrinter", data: LabelData) -> tuple[bool, str]:
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None, self._send_usb, printer.usb_device, data
            )
            return result
        except Exception as e:
            return False, f"Erro USB: {e}"

    def _send_usb(self, device: str | None, data: LabelData) -> tuple[bool, str]:
        if not device:
            device = self._detect_usb_device()

        if not device:
            return False, "Dispositivo USB não encontrado. Configure o campo usb_device na impressora."

        raw = data if isinstance(data, bytes) else data.encode("utf-8")
        try:
            with open(device, "wb") as f:
                f.write(raw)
            logger.info("Dados enviados via USB → %s (%d bytes)", device, len(raw))
            return True, f"Impresso com sucesso via USB ({device})."
        except PermissionError:
            return False, f"Sem permissão para acessar {device}. Execute com sudo ou adicione usuário ao grupo lp."
        except FileNotFoundError:
            return False, f"Dispositivo USB não encontrado: {device}."
        except OSError as e:
            return False, f"Erro ao escrever no USB: {e}"

    def _detect_usb_device(self) -> str | None:
        """Detecta automaticamente o device USB da impressora (Linux)."""
        if sys.platform == "win32":
            return None
        candidates = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/lp0"]
        import os
        for path in candidates:
            if os.path.exists(path):
                return path
        return None

    # -----------------------------------------------------------------------
    # Serial (RS-232)
    # -----------------------------------------------------------------------

    async def _print_serial(self, printer: "LabelPrinter", data: LabelData) -> tuple[bool, str]:
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None, self._send_serial, printer.serial_port, printer.baud_rate, data
            )
            return result
        except Exception as e:
            return False, f"Erro Serial: {e}"

    def _send_serial(self, port: str | None, baud_rate: int, data: LabelData) -> tuple[bool, str]:
        if not port:
            return False, "Porta serial não configurada."

        try:
            import serial  # type: ignore
        except ImportError:
            return False, "Biblioteca pyserial não instalada. Execute: pip install pyserial"

        raw = data if isinstance(data, bytes) else data.encode("utf-8")
        try:
            with serial.Serial(port, baud_rate, timeout=TCP_TIMEOUT) as ser:
                ser.write(raw)
            logger.info("Dados enviados via Serial → %s @ %s baud (%d bytes)", port, baud_rate, len(raw))
            return True, f"Impresso com sucesso via Serial ({port})."
        except serial.SerialException as e:
            return False, f"Erro na porta serial {port}: {e}"


printer_service = PrinterService()
