/** ILIKE pattern for "contains", with the user's own % and _ treated literally. */
export const containsPattern = (text: string) => `%${text.replace(/[%_\\]/g, "\\$&")}%`;
