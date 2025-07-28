
import React from "react";
import { Card, CardContent, Typography, Box, IconButton, TextField } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { LabelData } from "../types";

interface LabelCardEditableProps {
  label: LabelData;
  onDelete: (id: string) => void;
  onQuantityChange: (id: string, qty: number) => void;
}


const LabelCardEditable: React.FC<LabelCardEditableProps> = ({ label, onDelete, onQuantityChange }) => {
  const [line1, line2] = label.description.split("\n").length > 1
    ? [label.description.split("\n")[0], label.description.split("\n").slice(1).join(" ")]
    : [label.description, ""];

  return (
    <Card
      sx={{
        width: 340,
        m: 2,
        boxShadow: 4,
        borderRadius: 3,
        border: "2px solid #4CAF50",
        background: "#fff",
        position: "relative",
        transition: "box-shadow 0.2s, border-color 0.2s",
        '&:hover': { boxShadow: 8, borderColor: '#388E3C' },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1, color: "#222", fontSize: 20, letterSpacing: 0.5 }}>
            {line1}
          </Typography>
          <IconButton aria-label="Eliminar" onClick={() => onDelete(label.id)} size="small" sx={{ ml: 1, color: "#d32f2f" }}>
            <DeleteIcon />
          </IconButton>
        </Box>
        {line2 && (
          <Typography variant="subtitle1" sx={{ mb: 1, color: "#444", fontWeight: 500, fontSize: 16 }}>
            {line2}
          </Typography>
        )}
        <Box display="flex" flexDirection="column" alignItems="center" my={2}>
          {/* Simulación visual de código de barras */}
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0.5, mb: 1, mt: 1 }}>
            {Array.from({ length: 13 }).map((_, i) => (
              <Box key={i} sx={{ width: i % 3 === 0 ? 5 : 2, height: 38, background: '#111', borderRadius: 1, opacity: i % 4 === 0 ? 0.7 : 1 }} />
            ))}
          </Box>
          <Typography variant="h4" fontFamily="monospace" fontWeight={700} letterSpacing={2} sx={{ color: "#111", fontSize: 28, mb: 1 }}>
            {label.code}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" justifyContent="center" gap={1} mt={2}>
          <Typography variant="body2" sx={{ color: "#388E3C", fontWeight: 600 }}>Cantidad:</Typography>
          <TextField
            type="number"
            size="small"
            value={label.quantity}
            inputProps={{ min: 1, style: { width: 60, textAlign: "center", fontWeight: 700, color: "#222" } }}
            onChange={e => {
              const val = parseInt((e.target as HTMLInputElement).value, 10);
              if (!isNaN(val) && val > 0) onQuantityChange(label.id, val);
            }}
            sx={{
              '& .MuiInputBase-root': {
                borderRadius: 2,
                background: '#fff',
                border: '1.5px solid #4CAF50',
                fontWeight: 700,
              },
              '& .MuiOutlinedInput-notchedOutline': {
                border: 'none',
              },
              '& input': {
                textAlign: 'center',
                fontWeight: 700,
                color: '#222',
              },
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default LabelCardEditable;
