import React, { useState, useRef } from "react";
import { LabelData } from "./types";
import { PasteIcon, DownloadIcon, TrashIcon } from "./components/Icons";
import LabelPreview from "./components/LabelPreview";

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

    // ASCII Control Characters
    const STX = "\x02"; // Start of Text
    const ETX = "\x03"; // End of Text
    const ESC = "\x1b"; // Escape
    const LF = "\x0a"; // Line Feed (solo en asignaciones)
    const US = "\x1f"; // Unit Separator (cantidad)
    const ETB = "\x17"; // End of Transmission Block
    const CAN = "\x18"; // Cancel

    const commands: string[] = [];

    // === Cabecera fija ===
    commands.push(
      `${STX}SIg1,420${ETX}`,
      `${STX}SId5${ETX}`,
      `${STX}SIs50${ETX}`,
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
      `${STX}R${ETX}`
    );

    // === Bloques dinámicos ===
    labels.forEach((label) => {
      const [linea1, linea2] = splitDescription(label.description);
      commands.push(
        `${STX}${ESC}E1${CAN}${ETX}` +
          `${STX}${ESC}F"BR0"${LF}${label.code}${ETX}` +
          `${STX}${ESC}F"BR1"${LF}${label.code}${ETX}` +
          `${STX}${ESC}F"BR2"${LF}${label.code}${ETX}` +
          `${STX}${ESC}F"TX3"${LF}${linea1}${ETX}` +
          `${STX}${ESC}F"TX4"${LF}${linea2}${ETX}` +
          `${STX}${ESC}F"TX5"${LF}${linea1}${ETX}` +
          `${STX}${ESC}F"TX6"${LF}${linea2}${ETX}` +
          `${STX}${ESC}F"TX7"${LF}${linea1}${ETX}` +
          `${STX}${ESC}F"TX8"${LF}${linea2}${ETX}` +
          `${STX}${US}${label.quantity}${ETX}` +
          `${STX}${ETB}${ETX}`
      );
    });

    // === Generar archivo SIN saltos extra ===
    const fileContent = commands.join("");
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
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
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Generador de Archivos para Etiquetas
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Pega tus datos de SAP o Excel para crear un archivo (.txt) listo
            para impresoras industriales.
          </p>
        </header>

        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <label
            htmlFor="data-input"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Pega la tabla completa aquí (con encabezados):
          </label>
          <textarea
            id="data-input"
            ref={pasteAreaRef}
            rows={8}
            className="block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-4 font-mono placeholder-slate-400"
            placeholder={
              "Pega aquí la tabla copiada directamente desde tu sistema..."
            }
            aria-label="Área para pegar datos"
            onChange={handleInputChange}
            aria-invalid={!!error}
          />
          {error && (
            <div
              className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-md"
              role="alert"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="mt-3 text-sm text-green-700 bg-green-50 p-3 rounded-md"
              role="status"
            >
              {success}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleProcessData}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold">Etiquetas a Generar</h2>
                <p className="text-sm text-slate-500">
                  Se encontraron {labels.length} productos para un total de {totalLabelsToPrint} etiquetas.
                </p>
              </div>
              <div>
                <button
                  onClick={handleDownloadTxt}
                  className={`inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${labels.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  aria-label="Generar y descargar archivo TXT para impresora"
                  disabled={labels.length === 0 || processing}
                >
                  <DownloadIcon className="h-5 w-5" />
                  {processing ? "Generando..." : `Generar y Descargar TXT (${totalLabelsToPrint})`}
                </button>
                <button
                  onClick={clearAll}
                  className="ml-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  <TrashIcon className="h-5 w-5" />
                  Limpiar Todo
                </button>
              </div>
            </div>

            {/* Tabla de etiquetas */}
            <div className="flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full divide-y divide-slate-300">
                    <thead>
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-0">Código de Artículo</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Descripción</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Cant. Etiquetas</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0 w-12"><span className="sr-only">Eliminar</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {labels.map((label) => (
                        <tr key={label.id}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 sm:pl-0">{label.code}</td>
                          <td className="px-3 py-4 text-sm text-slate-500">{label.description}</td>
                          <td className="px-3 py-4 text-sm text-slate-500 text-center">{label.quantity}</td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                            <button onClick={() => handleRemoveLabel(label.id)} className="text-red-600 hover:text-red-900" aria-label={`Eliminar etiqueta para ${label.code}`}>
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Vista previa de bloques Fingerprint */}
            <LabelPreview labels={labels} />
          </>
        )}
      </main>
    </>
  );
};

export default App;
