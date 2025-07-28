#!/usr/bin/env python3

"""
Generador de archivos Fingerprint para impresora Honeywell PM42.

Este script toma un archivo de texto delimitado por tabuladores (TSV) con
cabeceras “Número de artículo”, “Descripción del artículo” y
“Cantidad de Etiquetas”, y produce un archivo de salida con los comandos
de control necesarios para imprimir etiquetas.  La estructura del archivo
está inspirada en las salidas generadas por SAP; cada comando se separa
con CR+LF.

Para cada registro:

* Si la cantidad de etiquetas es mayor que 1, se generan dos bloques:
  - Un bloque “principal” que imprime todas las etiquetas menos una,
    utilizando tres barcodes (BR0, BR1, BR2) y dos líneas de texto (TX3..TX8).
  - Un bloque “residual” que imprime una sola etiqueta utilizando un único
    barcode (BR0) y dos líneas de texto (TX3, TX4).  Esto imita el patrón
    observado en los archivos de SAP.
* Si la cantidad es 1 o 0, sólo se genera el bloque principal con el
  contador correspondiente.

Uso:
    python generate_labels.py input.tsv output.txt

El archivo de entrada debe tener una primera fila con los nombres de las
columnas; las filas posteriores contienen los datos.  El archivo de
salida se escribe en modo texto y no incluye BOM.

Nota: este script genera comandos como cadenas legibles (por ejemplo,
“<STX>” en lugar del código ASCII 0x02) porque es el formato utilizado
en los ejemplos de SAP.  Si tu impresora requiere los caracteres de
control reales, adapta el diccionario CONTROL_CHARS para mapear a
caracteres binarios.
"""

import csv
import os
import sys
from typing import List, Tuple

# Mapeo de caracteres de control a las etiquetas legibles usadas en los
# archivos de ejemplo.  Si necesitas códigos ASCII reales, cambia los
# valores por: "\x02", "\x03", etc.
CONTROL_CHARS = {
    "STX": "<STX>",
    "ETX": "<ETX>",
    "ESC": "<ESC>",
    "LF": "<LF>",
    "US": "<US>",
    "ETB": "<ETB>",
    "CAN": "<CAN>",
    "SI": "<SI>",
}


def split_description(description: str, max_length: int = 25) -> Tuple[str, str]:
    """Divide una descripción en dos líneas sin cortar palabras.

    Args:
        description: Cadena de entrada.
        max_length: Longitud máxima de la primera línea.

    Returns:
        Una tupla (linea1, linea2) donde linea2 puede estar vacía.
    """
    desc = (description or "").strip()
    if len(desc) <= max_length:
        return desc, ""
    # Encuentra el último espacio antes del límite
    split_pos = desc.rfind(" ", 0, max_length)
    if split_pos <= 0:
        split_pos = max_length
    line1 = desc[:split_pos].strip()
    line2 = desc[split_pos:].strip()
    return line1, line2


def build_header() -> List[str]:
    """Devuelve la cabecera fija basada en los ejemplos de SAP."""
    cc = CONTROL_CHARS
    return [
        f"{cc['STX']}{cc['SI']}g1,420{cc['ETX']}",
        f"{cc['STX']}{cc['SI']}d5{cc['ETX']}",
        f"{cc['STX']}{cc['SI']}s50{cc['ETX']}",
        f"{cc['STX']}{cc['ESC']}P;{cc['ETX']}",
        f"{cc['STX']}E1,1;A1,ETIQ2J;{cc['ETX']}",
        f"{cc['STX']}L39;D0;{cc['ETX']}",
        f"{cc['STX']}B0,BR0;o60,210;f1;c6,0;h50;w1;r0;i1;d0,12{cc['ETX']}",
        f"{cc['STX']}B1,BR1;o60,480;f1;c6,0;h50;w1;r0;i1;d0,12{cc['ETX']}",
        f"{cc['STX']}B2,BR2;o60,730;f1;c6,0;h50;w1;r0;i1;d0,12{cc['ETX']}",
        f"{cc['STX']}H3,TX3;o10,260;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}H4,TX4;o30,260;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}H5,TX5;o10,530;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}H6,TX6;o30,530;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}H7,TX7;o10,790;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}H8,TX8;o30,790;f1;c25;h8;w7;d0,25;{cc['ETX']}",
        f"{cc['STX']}I0;o110,220;f1;c25;h12;w12;{cc['ETX']}",
        f"{cc['STX']}I1;o110,490;f1;c25;h12;w12;{cc['ETX']}",
        f"{cc['STX']}I2;o110,740;f1;c25;h12;w12;{cc['ETX']}",
        f"{cc['STX']}R{cc['ETX']}",
        "",
    ]


def build_main_block(code: str, line1: str, line2: str, qty: int) -> str:
    """Construye el bloque principal con tres códigos de barra y dos líneas."""
    cc = CONTROL_CHARS
    return (
        f"{cc['STX']}{cc['ESC']}E1{cc['CAN']}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"BR0\"{cc['LF']}{code}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"BR1\"{cc['LF']}{code}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"BR2\"{cc['LF']}{code}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX3\"{cc['LF']}{line1}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX4\"{cc['LF']}{line2}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX5\"{cc['LF']}{line1}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX6\"{cc['LF']}{line2}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX7\"{cc['LF']}{line1}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX8\"{cc['LF']}{line2}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['US']}{qty}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ETB']}{cc['ETX']}\r\n"
    )


def build_residual_block(code: str, line1: str, line2: str) -> str:
    """Construye el bloque residual para imprimir una sola etiqueta."""
    cc = CONTROL_CHARS
    return (
        f"{cc['STX']}{cc['ESC']}E1{cc['CAN']}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"BR0\"{cc['LF']}{code}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX3\"{cc['LF']}{line1}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ESC']}F\"TX4\"{cc['LF']}{line2}{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['US']}1{cc['ETX']}\r\n"
        f"{cc['STX']}{cc['ETB']}{cc['ETX']}\r\n"
    )


def process_rows(rows: List[dict]) -> List[str]:
    """Genera los bloques dinámicos para todas las filas."""
    output: List[str] = []
    for row in rows:
        code = row.get("Número de artículo", "").strip()
        desc = row.get("Descripción del artículo", "").strip()
        qty_str = row.get("Cantidad de Etiquetas", "").strip()
        try:
            qty = int(qty_str)
        except ValueError:
            continue
        if qty <= 0 or not code:
            continue
        line1, line2 = split_description(desc)
        # Genera bloque principal
        if qty > 1:
            output.append(build_main_block(code, line1, line2, qty - 1))
            # Bloque residual con 1 unidad
            output.append(build_residual_block(code, line1, line2))
        else:
            # Cantidad == 1: imprime un bloque principal con qty=1
            output.append(build_main_block(code, line1, line2, qty))
    return output


def main(argv: List[str]) -> None:
    if len(argv) != 3:
        print("Uso: python generate_labels.py input.tsv output.txt", file=sys.stderr)
        sys.exit(1)
    input_path, output_path = argv[1], argv[2]
    # Lee el archivo TSV
    with open(input_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        rows = list(reader)
    header = build_header()
    blocks = process_rows(rows)
    # Concatena cabecera y bloques
    content = "\r\n".join(header + blocks)
    # Escribe el archivo sin BOM
    with open(output_path, "w", encoding="ascii", newline="") as f:
        f.write(content)
    print(f"Archivo generado: {output_path}")


if __name__ == "__main__":
    main(sys.argv)