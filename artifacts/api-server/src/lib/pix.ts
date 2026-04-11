// PIX BR Code (EMV) payload generator
// Ref: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II-ManualdePadroesparaIniciacaodoPix.pdf

function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

function crc16(payload: string): string {
  // CRC16-CCITT (poly 0x1021)
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function generatePixPayload(params: {
  pixKey: string;
  recipientName: string;
  city: string;
  amount?: number;
  txId?: string;
}): string {
  const { pixKey, recipientName, city, amount, txId } = params;

  let payload = "";
  payload += tlv("00", "01"); // Payload Format Indicator
  payload += tlv("26", // Merchant Account Information
    tlv("00", "BR.GOV.BCB.PIX") + tlv("01", pixKey)
  );
  payload += tlv("52", "0000"); // Merchant Category Code
  payload += tlv("53", "986"); // Transaction Currency (BRL)
  if (amount && amount > 0) {
    payload += tlv("54", amount.toFixed(2));
  }
  payload += tlv("58", "BR"); // Country Code
  payload += tlv("59", recipientName.slice(0, 25));
  payload += tlv("60", city.slice(0, 15));
  payload += tlv("62", tlv("05", txId || "***")); // Additional Data

  // CRC placeholder + calculation
  payload += "6304";
  const checksum = crc16(payload);
  payload += checksum;

  return payload;
}
