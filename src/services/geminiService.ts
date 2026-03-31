import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty, ComputerProficiency } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateQuestions = async (
  topic: string, 
  difficulty: Difficulty, 
  computerProficiency: ComputerProficiency,
  count: number = 5
): Promise<Question[]> => {
  const model = "gemini-3-flash-preview";
  
  const proficiencyContext = computerProficiency === ComputerProficiency.BASIC 
    ? "The user has basic computer knowledge. Use simple language, avoid technical jargon unless it's part of the topic, and provide very clear, step-by-step explanations."
    : computerProficiency === ComputerProficiency.ADVANCED
    ? "The user is tech-savvy. You can use advanced terminology, provide concise explanations, and include deeper technical context where relevant."
    : "The user has intermediate computer knowledge. Use standard educational language.";

  const prompt = `Generate ${count} multiple-choice questions for a learner studying the topic: "${topic}". 
  The subject difficulty level should be ${difficulty}. 
  ${proficiencyContext}
  Each question must have exactly 4 options, one correct answer, and a clear explanation of why the answer is correct.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The question text" },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Four multiple choice options"
            },
            correctAnswer: { type: Type.STRING, description: "The exact string of the correct option" },
            explanation: { type: Type.STRING, description: "Explanation of the correct answer" },
          },
          required: ["text", "options", "correctAnswer", "explanation"],
        },
      },
    },
  });

  const rawQuestions = JSON.parse(response.text || "[]");
  
  return rawQuestions.map((q: any, index: number) => ({
    ...q,
    id: `${topic}-${difficulty}-${index}-${Date.now()}`,
    difficulty,
    topic,
  }));
};

export const getAdaptiveFeedback = async (
  topic: string, 
  history: any[],
  computerProficiency: ComputerProficiency
): Promise<string> => {
  const model = "gemini-3-flash-preview";
  
  const proficiencyContext = computerProficiency === ComputerProficiency.BASIC 
    ? "Provide feedback using very simple, encouraging language. Avoid complex formatting."
    : "Provide detailed, analytical feedback.";

  const prompt = `Based on the following quiz history for the topic "${topic}", provide a brief, encouraging summary of the learner's strengths and areas for improvement. 
  ${proficiencyContext}
  History: ${JSON.stringify(history)}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "Keep learning and practicing!";
};
