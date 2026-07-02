declare module "qrcode" {
  export type QRCodeErrorCorrectionLevel = "low" | "medium" | "quartile" | "high" | "L" | "M" | "Q" | "H";

  export type QRCodeToStringOptions = {
    type?: "utf8" | "svg" | "terminal";
    small?: boolean;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  export type QRCodeToDataURLOptions = {
    type?: "image/png" | "image/jpeg" | "image/webp";
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
    scale?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toBuffer(text: string, options?: QRCodeToDataURLOptions): Promise<Buffer>;

  const QRCode: {
    toString: typeof toString;
    toDataURL: typeof toDataURL;
    toBuffer: typeof toBuffer;
  };
  export default QRCode;
}
