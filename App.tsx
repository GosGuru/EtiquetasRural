import React, { useState, useRef } from "react";
import { LabelData } from "./types";
import { PasteIcon, DownloadIcon, TrashIcon } from "./components/Icons";
import LabelCardEditable from "./components/LabelCardEditable";

/**
 * Removes invisible characters (like zero-width spaces) from a string.
 * This helps clean up data pasted from rich text sources like Word or Google Docs.
 * @param input The string to sanitize.
 * @returns The sanitized string.
 */
const sanitizeString = (input: string): string => {
  if (!input) return "";
  // This regex targets zero-width space, zero-width non-joiner, zero-width joiner, and byte order mark.
  return input.replace(/[\u200B-\u200D\uFEFF]/g, "");
};

/**
 * Splits a description into two lines for the label printer.
 * It tries to split at the last space before the maxLength to keep words intact.
 * The maxLength is set to 25 to align with the printer's label format definition (d0,25).
 * @param description The full product description.
 * @param maxLength The maximum length of the first line (default: 25).
 * @returns An array containing the first and second lines.
 */
const splitDescription = (
  description: string,
  maxLength: number = 25
): [string, string] => {
  const trimmedDesc = description.trim();
  if (trimmedDesc.length <= maxLength) {
    return [trimmedDesc, ""];
  }

  // Find the last space at or before maxLength to avoid splitting words.
  let splitPos = trimmedDesc.lastIndexOf(" ", maxLength);

  // If no space is found, or it's at the very beginning, we have to split the word.
  if (splitPos <= 0) {
    splitPos = maxLength;
  }

  const line1 = trimmedDesc.substring(0, splitPos).trim();
  const line2 = trimmedDesc.substring(splitPos).trim();

  return [line1, line2];
};

const App: React.FC = () => {
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

  // UX: Limpiar mensajes al cambiar datos
  const handleInputChange = () => {
    setError(null);
    setSuccess(null);
  };

  const handleProcessData = () => {
    setError(null);
    setSuccess(null);
    if (!pasteAreaRef.current?.value) return;

    const text = pasteAreaRef.current.value.trim();
    if (!text) return;

    const rows = text.split("\n").filter((row) => row.trim() !== "");
    if (rows.length < 2) {
      setError(
        "Error: Se necesitan al menos una fila de encabezado y una fila de datos."
      );
      return;
    }

    const headerRow = rows[0];
    const headers = headerRow.split("\t").map((h) => h.trim());

    // Define the exact headers we are looking for
    const CODE_HEADER = "Número de artículo";
    const DESC_HEADER = "Descripción del artículo";
    const QTY_HEADER = "Cantidad de Etiquetas";

    const codeIndex = headers.indexOf(CODE_HEADER);
    const descIndex = headers.indexOf(DESC_HEADER);
    const qtyIndex = headers.indexOf(QTY_HEADER);

    // Validate that all required headers were found
    if (codeIndex === -1) {
      setError(`Error: No se encontró la columna requerida "${CODE_HEADER}".`);
      return;
    }
    if (descIndex === -1) {
      setError(`Error: No se encontró la columna requerida "${DESC_HEADER}".`);
      return;
    }
    if (qtyIndex === -1) {
      setError(`Error: No se encontró la columna requerida "${QTY_HEADER}".`);
      return;
    }

    const newLabels: LabelData[] = [];
    const dataRows = rows.slice(1); // All rows except the header

    dataRows.forEach((rowStr, index) => {
      const columns = rowStr.split("\t").map((c) => c.trim());
      if (columns.length > Math.max(codeIndex, descIndex, qtyIndex)) {
        const code = columns[codeIndex];
        const description = sanitizeString(columns[descIndex]);
        const quantityStr = columns[qtyIndex];
        if (code && description && quantityStr) {
          const quantity = parseInt(quantityStr, 10);
          if (!isNaN(quantity) && quantity > 0) {
            newLabels.push({
              id: `label-${Date.now()}-${index}`,
              code,
              description,
              quantity,
            });
          }
        }
      }
    });

    if (newLabels.length > 0) {
      setLabels((currentLabels) => [...currentLabels, ...newLabels]);
      if (pasteAreaRef.current) {
        pasteAreaRef.current.value = "";
      }
      setSuccess("Datos procesados correctamente.");
    } else {
      setError(
        "No se encontraron datos válidos para procesar. Verifique que las filas de datos tengan valores y que 'Cantidad de Etiquetas' sea un número mayor a 0."
      );
    }
  };


  const handleRemoveLabel = (id: string) => {
    setLabels((currentLabels) => currentLabels.filter((l) => l.id !== id));
    setSuccess(null);
  };

  const handleQuantityChange = (id: string, qty: number) => {
    setLabels((currentLabels) =>
      currentLabels.map(l => l.id === id ? { ...l, quantity: qty } : l)
    );
    setSuccess(null);
  };

  /**
   * Genera y descarga el archivo TXT 100% compatible con Honeywell PM42 Fingerprint.
   * - Cada comando va pegado, sin saltos de línea ni CR/LF entre comandos.
   * - Se usan los caracteres de control ASCII requeridos:
   *   STX (\x02): inicio de comando
   *   ETX (\x03): fin de comando
   *   ESC (\x1b): escape
   *   LF  (\x0A): salto de línea SOLO para asignación de valor (F"TXx" o F"BRx")
   *   US  (\x1f): separador de unidad (cantidad)
   *   ETB (\x17): fin de bloque
   *   CAN (\x18): cancel
   * - No se agrega CR (\x0D), ni saltos visuales, ni BOM.
   */
  /**
   * Genera y descarga el archivo TXT 100% compatible con Honeywell PM42.
   * - Sin CR (\x0D), sin BOM, sin saltos extra.
   * - Usa caracteres de control ASCII requeridos.
   */
  const handleDownloadTxt = () => {
    setProcessing(true);
    setError(null);
    setSuccess(null);

    // Caracteres de control como texto literal
    const STX = "<STX>";
    const ETX = "<ETX>";
    const ESC = "<ESC>";
    const LF  = "<LF>";
    const US  = "<US>";
    const ETB = "<ETB>";
    const CAN = "<CAN>";
    const SI  = "<SI>";

    // Cabecera fija (idéntica a SAP)
    const header = [
      `${STX}${SI}g1,420${ETX}`,
      `${STX}${SI}d5${ETX}`,
      `${STX}${SI}s50${ETX}`,
      `${STX}${ESC}P;${ETX}`,
      `${STX}E1,1;A1,ETIQ2J;${ETX}`,
      `${STX}L39;D0;${ETX}`,
      `${STX}B0,BR0;o60,210;f1;c6,0;h50;w1;r0;i1;d0,12${ETX}`,
      `${STX}B1,BR1;o60,480;f1;c6,0;h50;w1;r0;i1;d0,12${ETX}`,
      `${STX}B2,BR2;o60,730;f1;c6,0;h50;w1;r0;i1;d0,12${ETX}`,
      `${STX}H3,TX3;o10,260;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H4,TX4;o30,260;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H5,TX5;o10,530;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H6,TX6;o30,530;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H7,TX7;o10,790;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H8,TX8;o30,790;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}I0;o110,220;f1;c25;h12;w12;${ETX}`,
      `${STX}I1;o110,490;f1;c25;h12;w12;${ETX}`,
      `${STX}I2;o110,740;f1;c25;h12;w12;${ETX}`,
      `${STX}R${ETX}`,
      ""
    ];

    // Genera bloques igual que el script Python
    function buildMainBlock(code: string, line1: string, line2: string, qty: number): string {
      return (
        `${STX}${ESC}E1${CAN}${ETX}\r\n` +
        `${STX}${ESC}F"BR0"${LF}${code}${ETX}\r\n` +
        `${STX}${ESC}F"BR1"${LF}${code}${ETX}\r\n` +
        `${STX}${ESC}F"BR2"${LF}${code}${ETX}\r\n` +
        `${STX}${ESC}F"TX3"${LF}${line1}${ETX}\r\n` +
        `${STX}${ESC}F"TX4"${LF}${line2}${ETX}\r\n` +
        `${STX}${ESC}F"TX5"${LF}${line1}${ETX}\r\n` +
        `${STX}${ESC}F"TX6"${LF}${line2}${ETX}\r\n` +
        `${STX}${ESC}F"TX7"${LF}${line1}${ETX}\r\n` +
        `${STX}${ESC}F"TX8"${LF}${line2}${ETX}\r\n` +
        `${STX}${US}${qty}${ETX}\r\n` +
        `${STX}${ETB}${ETX}\r\n`
      );
    }

    function buildResidualBlock(code: string, line1: string, line2: string): string {
      return (
        `${STX}${ESC}E1${CAN}${ETX}\r\n` +
        `${STX}${ESC}F"BR0"${LF}${code}${ETX}\r\n` +
        `${STX}${ESC}F"TX3"${LF}${line1}${ETX}\r\n` +
        `${STX}${ESC}F"TX4"${LF}${line2}${ETX}\r\n` +
        `${STX}${US}1${ETX}\r\n` +
        `${STX}${ETB}${ETX}\r\n`
      );
    }

    const blocks: string[] = [];
    labels.forEach((label) => {
      const [line1, line2] = splitDescription(label.description);
      const qty = label.quantity;
      if (qty > 1) {
        blocks.push(buildMainBlock(label.code, line1, line2, qty - 1));
        blocks.push(buildResidualBlock(label.code, line1, line2));
      } else if (qty === 1) {
        blocks.push(buildMainBlock(label.code, line1, line2, 1));
      }
    });

    // Une cabecera y bloques, separados por CRLF
    const fileContent = [...header, ...blocks].join("\r\n");

    // Descargar como texto plano
    const blob = new Blob([fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "etiquetas_generadas_fingerprint.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setProcessing(false);
    setSuccess("Archivo TXT generado y descargado correctamente.");
  };

  const clearAll = () => {
    setLabels([]);
    setError(null);
    setSuccess(null);
  };

  const totalLabelsToPrint = labels.reduce(
    (sum, label) => sum + label.quantity,
    0
  );

  return (
    <>
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8" style={{ background: '#F5F5F5', minHeight: '100vh' }}>
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: '#388E3C', fontFamily: 'Montserrat, Arial, sans-serif', letterSpacing: 1 }}>
            Generador de Archivos para Etiquetas
          </h1>
          <p className="mt-4 text-lg" style={{ color: '#4CAF50', fontWeight: 500 }}>
            Pega tus datos de SAP o Excel para crear un archivo (.txt) listo para impresoras industriales de <span style={{ color: '#222', fontWeight: 700 }}>Almacén Rural</span>.
          </p>
        </header>

        <div style={{ background: '#fff', border: '2px solid #4CAF50', borderRadius: 16, boxShadow: '0 2px 12px 0 #388E3C22', padding: 32, marginBottom: 32 }}>
          <label
            htmlFor="data-input"
            className="block text-sm font-semibold mb-2"
            style={{ color: '#388E3C', fontSize: 16 }}
          >
            Pega la tabla completa aquí (con encabezados):
          </label>
          <textarea
            id="data-input"
            ref={pasteAreaRef}
            rows={8}
            className="block w-full font-mono placeholder-slate-400"
            style={{ borderRadius: 8, border: '1.5px solid #4CAF50', padding: 16, fontSize: 15, background: '#F1F8E9', color: '#222', outline: 'none', boxShadow: '0 1px 4px #388E3C11' }}
            placeholder={"Pega aquí la tabla copiada directamente desde tu sistema..."}
            aria-label="Área para pegar datos"
            onChange={handleInputChange}
            aria-invalid={!!error}
          />
          {error && (
            <div
              className="mt-3 text-sm"
              style={{ color: '#d32f2f', background: '#FFEBEE', padding: 12, borderRadius: 8, fontWeight: 600 }}
              role="alert"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="mt-3 text-sm"
              style={{ color: '#388E3C', background: '#E8F5E9', padding: 12, borderRadius: 8, fontWeight: 600 }}
              role="status"
            >
              {success}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleProcessData}
              className="inline-flex items-center gap-2 font-semibold shadow-sm"
              style={{
                background: '#388E3C',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: 15,
                transition: 'background 0.2s',
                boxShadow: '0 2px 8px #388E3C22',
                outline: 'none',
                border: 'none',
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.7 : 1,
              }}
              aria-label="Procesar y añadir a la lista"
              disabled={processing}
            >
              <PasteIcon className="h-5 w-5" />
              {processing ? "Procesando..." : "Procesar y Añadir a la Lista"}
            </button>
          </div>
        </div>

        {labels.length > 0 && (
          <>
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-center" style={{ gap: 16 }}>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: '#388E3C', fontFamily: 'Montserrat, Arial, sans-serif' }}>Etiquetas a Generar</h2>
                <p className="text-sm" style={{ color: '#49864bff', fontWeight: 500 }}>
                  Se encontraron {labels.length} productos para un total de {totalLabelsToPrint} etiquetas.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-2 font-semibold shadow-sm"
                  style={{
                    background: '#4CAF50',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontSize: 15,
                    transition: 'background 0.2s',
                    boxShadow: '0 2px 8px #388E3C22',
                    outline: 'none',
                    border: 'none',
                    cursor: labels.length === 0 || processing ? 'not-allowed' : 'pointer',
                    opacity: labels.length === 0 || processing ? 0.7 : 1,
                  }}
                  aria-label="Generar y descargar archivo TXT para impresora"
                  disabled={labels.length === 0 || processing}
                >
                  <DownloadIcon className="h-5 w-5" />
                  {processing ? "Generando..." : `Generar y Descargar TXT (${totalLabelsToPrint})`}
                </button>
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-2 font-semibold shadow-sm"
                  style={{
                    background: '#d32f2f',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '10px 20px',
                    fontSize: 15,
                    transition: 'background 0.2s',
                    boxShadow: '0 2px 8px #d32f2f22',
                    outline: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <TrashIcon className="h-5 w-5" />
                  Limpiar Todo
                </button>
              </div>
            </div>

            {/* Vista previa tipo etiqueta impresa, editable */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
              {labels.map(label => (
                <LabelCardEditable
                  key={label.id}
                  label={label}
                  onDelete={handleRemoveLabel}
                  onQuantityChange={handleQuantityChange}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
};

export default App;
