import React, { useState } from "react";
import { Modal, Box, Typography, TextField, Button, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { code: string; description: string; quantity: number }) => void;
}

const style = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 370,
  bgcolor: 'background.paper',
  borderRadius: 3,
  boxShadow: 24,
  p: 4,
};

const AddLabelModal: React.FC<Props> = ({ open, onClose, onAdd }) => {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [error, setError] = useState<string>("");

  const handleAdd = () => {
    if (!code.trim() || !description.trim()) {
      setError("Código y descripción son obligatorios.");
      return;
    }
    if (quantity < 0 || isNaN(quantity)) {
      setError("Cantidad debe ser 0 o mayor.");
      return;
    }
    onAdd({ code: code.trim(), description: description.trim(), quantity });
    setCode("");
    setDescription("");
    setQuantity(1);
    setError("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={style}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={700}>Agregar Etiqueta Manual</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <TextField
          label="Código"
          fullWidth
          value={code}
          onChange={e => setCode(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Descripción"
          fullWidth
          value={description}
          onChange={e => setDescription(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Cantidad"
          type="number"
          fullWidth
          value={quantity}
          onChange={e => setQuantity(Number(e.target.value))}
          inputProps={{ min: 0 }}
          sx={{ mb: 2 }}
        />
        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
        <Button variant="contained" color="success" fullWidth onClick={handleAdd}>
          Agregar Etiqueta
        </Button>
      </Box>
    </Modal>
  );
};

export default AddLabelModal;
