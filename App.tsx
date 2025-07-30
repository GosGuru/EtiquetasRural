import React, { useState, useRef } from "react";
import { LabelData } from "./types";
import { PasteIcon, DownloadIcon, TrashIcon } from "./components/Icons";
import LabelCardEditable from "./components/LabelCardEditable";
import AddLabelModal from "./components/AddLabelModal";
import AddIcon from "@mui/icons-material/Add";

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
  const [addModalOpen, setAddModalOpen] = useState(false);
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
        let quantity = 0;
        if (code && description) {
          if (quantityStr && !isNaN(parseInt(quantityStr, 10))) {
            quantity = parseInt(quantityStr, 10);
          }
          newLabels.push({
            id: `label-${Date.now()}-${index}`,
            code,
            description,
            quantity,
          });
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
        "No se encontraron datos válidos para procesar. Verifique que las filas de datos tengan valores."
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


  // Helper para generar el bloque de impresión de etiquetas Honeywell PM42
  function buildLabelBlock(code: string, line1: string, line2: string, qty: number): string {
    const STX = "<STX>";
    const ETX = "<ETX>";
    const ESC = "<ESC>";
    const LF  = "<LF>";
    const US  = "<US>";
    const ETB = "<ETB>";
    const CAN = "<CAN>";
    // Solo BR0, US = qty
    return (
      `${STX}${ESC}E1${CAN}${ETX}\r\n` +
      `${STX}${ESC}F"BR0"${LF}${code}${ETX}\r\n` +
      `${STX}${ESC}F"TX3"${LF}${line1}${ETX}\r\n` +
      `${STX}${ESC}F"TX4"${LF}${line2}${ETX}\r\n` +
      `${STX}${US}${qty}${ETX}\r\n` +
      `${STX}${ETB}${ETX}\r\n`
    );
  }

  /**
   * Genera y descarga el archivo TXT compatible con Honeywell PM42 Fingerprint.
   * - Solo usa BR0 para el código de barras.
   * - US = cantidad exacta de etiquetas.
   * - Un solo bloque por artículo.
   */
  const handleDownloadTxt = () => {
    setProcessing(true);
    setError(null);
    setSuccess(null);

    const STX = "<STX>";
    const ETX = "<ETX>";
    const ESC = "<ESC>";
    const LF  = "<LF>";
    const SI  = "<SI>";

    // Cabecera fija (idéntica a SAP, pero solo BR0)
    const header = [
      `${STX}${SI}g1,420${ETX}`,
      `${STX}${SI}d5${ETX}`,
      `${STX}${SI}s50${ETX}`,
      `${STX}${ESC}P;${ETX}`,
      `${STX}E1,1;A1,ETIQ2J;${ETX}`,
      `${STX}L39;D0;${ETX}`,
      `${STX}B0,BR0;o60,210;f1;c6,0;h50;w1;r0;i1;d0,12${ETX}`,
      `${STX}H3,TX3;o10,260;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}H4,TX4;o30,260;f1;c25;h8;w7;d0,25;${ETX}`,
      `${STX}I0;o110,220;f1;c25;h12;w12;${ETX}`,
      `${STX}R${ETX}`,
      ""
    ];

    const blocks: string[] = [];
    labels.filter(label => label.quantity > 0).forEach((label) => {
      const [line1, line2] = splitDescription(label.description);
      blocks.push(buildLabelBlock(label.code, line1, line2, label.quantity));
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
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8" style={{ background: '#F5F5F5', minHeight: '100vh', position: 'relative' }}>
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
                  onDelete={() => handleRemoveLabel(label.id)}
                  onQuantityChange={handleQuantityChange}
                />
              ))}
            </div>
          </>
        )}

        {/* Botón flotante en esquina inferior derecha */}
        <button
          onClick={() => setAddModalOpen(true)}
          style={{
            position: 'fixed',
            right: 32,
            bottom: 32,
            zIndex: 100,
            background: '#4CAF50',
            color: '#fff',
            borderRadius: '50%',
            width: 60,
            height: 60,
            boxShadow: '0 4px 16px #388E3C44',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          aria-label="Agregar etiqueta manual"
        >
          <AddIcon fontSize="inherit" />
        </button>
      </main>
      <AddLabelModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={(data) => {
          setLabels(currentLabels => [
            ...currentLabels,
            {
              id: `label-manual-${Date.now()}`,
              code: data.code,
              description: data.description,
              quantity: data.quantity,
            }
          ]);
          setSuccess(null);
        }}
      />
    </>
  );
};

export default App;
