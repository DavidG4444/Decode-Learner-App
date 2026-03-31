export enum Difficulty {
  BEGINNER = "Beginner",
  INTERMEDIATE = "Intermediate",
  ADVANCED = "Advanced",
}

export enum ComputerProficiency {
  BASIC = "Basic",
  INTERMEDIATE = "Intermediate",
  ADVANCED = "Advanced",
}

export enum UserRole {
  STUDENT = "student",
  TEACHER = "teacher",
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: Difficulty;
  topic: string;
}

export interface QuizState {
  topic: string;
  currentQuestionIndex: number;
  questions: Question[];
  score: number;
  history: {
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
  }[];
  difficulty: Difficulty;
  isComplete: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  computerProficiency: ComputerProficiency;
  totalPoints: number;
  quizzesCompleted: number;
  computerTopicProgress: number;
  createdAt: any;
}

export interface TeacherFeedback {
  id: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  content: string;
  suggestions: string;
  timestamp: any;
}
