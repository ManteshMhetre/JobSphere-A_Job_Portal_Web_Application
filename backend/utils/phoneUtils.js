export function convertPhoneToNumber(phone) {
  if (!phone) {
    throw new Error("Phone number is required");
  }

  const phoneNumber = typeof phone === "string" ? parseInt(phone) : phone;

  if (isNaN(phoneNumber) || phoneNumber <= 0) {
    throw new Error("Please provide a valid phone number (digits only)");
  }

  const phoneStr = phoneNumber.toString();

  // Check if exactly 10 digits
  if (!/^[6-9]\d{9}$/.test(phoneStr)) {
    throw new Error(
      "Invalid Indian phone number. It must be 10 digits and start with 6, 7, 8, or 9."
    );
  }

  return phoneNumber;
}

export function safeConvertPhoneToNumber(phone) {
  try {
    return convertPhoneToNumber(phone);
  } catch (error) {
    return null;
  }
}

export function isValidPhoneNumber(phone) {
  try {
    convertPhoneToNumber(phone);
    return true;
  } catch (error) {
    return false;
  }
}

export function formatPhoneForDisplay(phone) {
  const phoneStr = phone.toString();

  if (phoneStr.length === 10) {
    // US format: (123) 456-7890
    return `(${phoneStr.slice(0, 3)}) ${phoneStr.slice(3, 6)}-${phoneStr.slice(
      6
    )}`;
  } else if (phoneStr.length === 11 && phoneStr.startsWith("1")) {
    // US with country code: +1 (123) 456-7890
    return `+1 (${phoneStr.slice(1, 4)}) ${phoneStr.slice(
      4,
      7
    )}-${phoneStr.slice(7)}`;
  } else if (phoneStr.length >= 10) {
    // International format: +XX XXXX XXXX
    return `+${phoneStr.slice(0, phoneStr.length - 10)} ${phoneStr.slice(
      -10,
      -6
    )} ${phoneStr.slice(-6)}`;
  }

  return phoneStr; // Return as-is if no specific format matches
}

export function parseFormattedPhone(formattedPhone) {
  const digitsOnly = formattedPhone.replace(/[^0-9]/g, "");
  return convertPhoneToNumber(digitsOnly);
}

export default {
  convertPhoneToNumber,
  safeConvertPhoneToNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  parseFormattedPhone,
};
