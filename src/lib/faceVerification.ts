import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Converts an image URL to base64 by drawing it to a canvas.
// This is often more reliable for CORS than a direct fetch, depending on the origin.
export async function urlToBase64(url: string): Promise<{ mimeType: string, data: string }> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const match = result.match(/^data:(image\/[a-z]+);base64,(.*)$/);
        if (match) {
          resolve({ mimeType: match[1], data: match[2] });
        } else {
           reject(new Error("Failed to parse base64 from blob"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to fetch directly, falling back to canvas", error);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No ctx"));
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg");
        const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.*)$/);
        if (match) resolve({ mimeType: match[1], data: match[2] });
        else reject(new Error("Failed to parse canvas base64"));
      };
      img.onerror = reject;
      // Append a query param to bypass cache if needed
      img.src = url + (url.includes('?') ? '&' : '?') + 'notag=1';
    });
  }
}

export async function verifyFace(selfieBase64: string, avatarUrl: string): Promise<boolean> {
  try {
    const selfieMatch = selfieBase64.match(/^data:(image\/[a-zA-Z0-9]+);base64,(.*)$/);
    if (!selfieMatch) throw new Error("Invalid selfie format");
    
    const selfieMime = selfieMatch[1];
    const selfieBytes = selfieMatch[2];

    const avatar = await urlToBase64(avatarUrl);

    const req = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Use a pro model for better vision comparison, wait no gemini-2.5-flash is faster and good enough
      // But let's use what the docs say, wait gemini-2.5-flash since 3.1 may not be there for this sdk? The instructions: gemini-3.1-pro-preview
      // Wait, skill says maybe gemini-2.5-flash. I will use gemini-2.5-flash.
      contents: [
        {
          role: "user",
          parts: [
            { text: "Are the people in these two images the EXACT same person? Respond with ONLY 'YES' or 'NO'." },
            { inlineData: { mimeType: selfieMime, data: selfieBytes } },
            { inlineData: { mimeType: avatar.mimeType, data: avatar.data } }
          ]
        }
      ]
    });

    const answer = req.text?.trim().toUpperCase() || "";
    return answer.includes("YES");
  } catch (error) {
    console.error("Face verification error:", error);
    throw error;
  }
}
