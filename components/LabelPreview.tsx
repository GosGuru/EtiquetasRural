import React from "react";
import { LabelData } from "../types";

interface LabelPreviewProps {
  labels: LabelData[];
}

/**
 * Vista previa de los bloques Fingerprint generados para cada etiqueta.
 * Muestra el bloque tal como se enviará a la impresora, con caracteres de control visibles.
 */
const LabelPreview: React.FC<LabelPreviewProps> = ({ labels }) => {
  if (!labels.length) return null;

  // Caracteres de control para mostrar en la vista previa
  const STX = "␂"; // \x02
  const ETX = "␃"; // \x03
  const ESC = "␛"; // \x1b
  const LF = "␊";  // \x0a
  const US = "␟";  // \x1f
  const ETB = "␗"; // \x17
  const CAN = "␘"; // \x18

  // Utilidad para dividir la descripción
  const splitDescription = (description: string, maxLength: number = 25): [string, string] => {
    const trimmedDesc = description.trim();
    if (trimmedDesc.length <= maxLength) {
      return [trimmedDesc, ""];
    }
    let splitPos = trimmedDesc.lastIndexOf(" ", maxLength);
    if (splitPos <= 0) splitPos = maxLength;
    const line1 = trimmedDesc.substring(0, splitPos).trim();
    const line2 = trimmedDesc.substring(splitPos).trim();
    return [line1, line2];
  };

  return (
    <div className="mt-10">
      <h3 className="text-lg font-semibold mb-2">Vista previa de bloques Fingerprint</h3>
      <div className="overflow-x-auto bg-slate-50 rounded p-4 border border-slate-200 text-xs font-mono">
        {labels.map((label, idx) => {
          const [linea1, linea2] = splitDescription(label.description);
          return (
            <div key={label.id} className="mb-4">
              <div className="text-slate-500 mb-1">Etiqueta {idx + 1} ({label.code})</div>
              <pre className="whitespace-pre-wrap break-all bg-white p-2 rounded border border-slate-100">
{`${STX}${ESC}E1${CAN}${ETX}
${STX}${ESC}F"BR0"${LF}${label.code}${ETX}
${STX}${ESC}F"BR1"${LF}${label.code}${ETX}
${STX}${ESC}F"BR2"${LF}${label.code}${ETX}
${STX}${ESC}F"TX3"${LF}${linea1}${ETX}
${STX}${ESC}F"TX4"${LF}${linea2}${ETX}
${STX}${ESC}F"TX5"${LF}${linea1}${ETX}
${STX}${ESC}F"TX6"${LF}${linea2}${ETX}
${STX}${ESC}F"TX7"${LF}${linea1}${ETX}
${STX}${ESC}F"TX8"${LF}${linea2}${ETX}
${STX}${US}${label.quantity}${ETX}
${STX}${ETB}${ETX}`}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LabelPreview;
