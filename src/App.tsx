import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Brain, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Trophy, 
  RefreshCcw, 
  ArrowLeft,
  Loader2,
  Sparkles,
  BarChart3,
  User,
  Settings,
  Monitor,
  MousePointer2,
  Keyboard,
  Info,
  LogOut,
  LogIn,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { Question, Difficulty, QuizState, ComputerProficiency, UserProfile, UserRole, TeacherFeedback } from './types';
import { generateQuestions, getAdaptiveFeedback } from './services/geminiService';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  handleFirestoreError,
  OperationType
} from './firebase';
import { 
  MessageSquare, 
  Users, 
  Send, 
  Calendar,
  History,
  TrendingUp,
  Award
} from 'lucide-react';

export default function App() {
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // User Profile State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  // Quiz State
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [adaptiveFeedback, setAdaptiveFeedback] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.BEGINNER);
  const [showSettings, setShowSettings] = useState(false);

  // Assessment State
  const [isAssessing, setIsAssessing] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setProfile(null);
        setIsProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Profile Listener
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      } else {
        setProfile(null);
      }
      setIsProfileLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      reset();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleAssessmentComplete = async (proficiency: ComputerProficiency, role: UserRole = UserRole.STUDENT) => {
    if (!user) return;
    
    const newProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || 'Learner',
      email: user.email || '',
      role: role,
      computerProficiency: proficiency,
      totalPoints: 0,
      quizzesCompleted: 0,
      computerTopicProgress: 0,
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setIsAssessing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const startQuiz = async (customTopic?: string) => {
    const targetTopic = customTopic || topic;
    if (!targetTopic.trim() || !profile) return;
    
    setIsGenerating(true);
    try {
      const questions = await generateQuestions(targetTopic, difficulty, profile.computerProficiency);
      setQuizState({
        topic: targetTopic,
        currentQuestionIndex: 0,
        questions,
        score: 0,
        history: [],
        difficulty,
        isComplete: false,
      });
      setAdaptiveFeedback(null);
    } catch (error) {
      console.error("Failed to generate questions:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnswer = (answer: string) => {
    if (showFeedback || !quizState) return;
    setSelectedAnswer(answer);
    setShowFeedback(true);
  };

  const nextQuestion = async () => {
    if (!quizState || !profile || !user) return;

    const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    
    const newHistory = [
      ...quizState.history,
      {
        questionId: currentQuestion.id,
        userAnswer: selectedAnswer!,
        isCorrect,
      }
    ];

    const newScore = isCorrect ? quizState.score + 1 : quizState.score;
    const isLastQuestion = quizState.currentQuestionIndex === quizState.questions.length - 1;

    if (isLastQuestion) {
      setQuizState({
        ...quizState,
        score: newScore,
        history: newHistory,
        isComplete: true,
      });
      
      // Update profile stats in Firestore
      const updates: any = {
        totalPoints: profile.totalPoints + (newScore * 10),
        quizzesCompleted: profile.quizzesCompleted + 1
      };

      // If topic is "Computer", increase progress and potentially proficiency
      if (quizState.topic.toLowerCase().includes('computer')) {
        const newProgress = Math.min(100, profile.computerTopicProgress + 20);
        updates.computerTopicProgress = newProgress;
        
        if (newProgress >= 100) {
          if (profile.computerProficiency === ComputerProficiency.BASIC) {
            updates.computerProficiency = ComputerProficiency.INTERMEDIATE;
            updates.computerTopicProgress = 0; // Reset for next level
          } else if (profile.computerProficiency === ComputerProficiency.INTERMEDIATE) {
            updates.computerProficiency = ComputerProficiency.ADVANCED;
            updates.computerTopicProgress = 0;
          }
        }
      }

      try {
        await updateDoc(doc(db, 'users', user.uid), updates);
        await addDoc(collection(db, 'quizHistory'), {
          uid: user.uid,
          topic: quizState.topic,
          score: newScore,
          totalQuestions: quizState.questions.length,
          difficulty: quizState.difficulty,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'users/quizHistory');
      }
      
      // Get adaptive feedback
      const feedback = await getAdaptiveFeedback(quizState.topic, newHistory, profile.computerProficiency);
      setAdaptiveFeedback(feedback);
    } else {
      setQuizState({
        ...quizState,
        currentQuestionIndex: quizState.currentQuestionIndex + 1,
        score: newScore,
        history: newHistory,
      });
      setSelectedAnswer(null);
      setShowFeedback(false);
    }
  };

  const reset = () => {
    setQuizState(null);
    setTopic('');
    setSelectedAnswer(null);
    setShowFeedback(false);
    setAdaptiveFeedback(null);
  };

  if (!isAuthReady || (user && isProfileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="animate-spin text-brand-600 mx-auto mb-4" size={48} />
          <p className="text-slate-500 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!profile && !isAssessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-12 text-center max-w-lg">
          <div className="bg-brand-100 text-brand-600 p-4 rounded-full inline-flex mb-6">
            <ShieldCheck size={48} />
          </div>
          <h2 className="text-3xl font-bold mb-4">Welcome, {user.displayName}!</h2>
          <p className="text-slate-500 mb-8">To give you the best experience, we need to assess your current computer knowledge.</p>
          <button onClick={() => setIsAssessing(true)} className="btn-primary w-full py-4 text-lg">
            Start Assessment
          </button>
        </motion.div>
      </div>
    );
  }

  if (isAssessing) {
    return <Assessment onComplete={handleAssessmentComplete} />;
  }

  const isTeacher = profile?.role === UserRole.TEACHER;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* App Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-lg text-white">
            <Brain size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:block">Adaptive Learner</span>
          {isTeacher && (
            <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ml-2">
              Teacher Portal
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!isTeacher && (
            <div className="hidden md:flex items-center gap-4 mr-4 border-r border-slate-200 pr-4">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Points</p>
                <p className="font-mono font-bold text-brand-600">{profile?.totalPoints}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Level</p>
                <p className="font-mono font-bold text-slate-900">{profile?.computerProficiency}</p>
              </div>
            </div>
          )}
          
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <Settings size={20} />
          </button>
          
          <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">
            <LogOut size={16} className="text-slate-500" />
            <span className="text-sm font-semibold">Logout</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center p-4 md:p-8">
        {isTeacher ? (
          <TeacherDashboard profile={profile!} />
        ) : (
          <StudentDashboard 
            profile={profile!} 
            quizState={quizState}
            isGenerating={isGenerating}
            topic={topic}
            setTopic={setTopic}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            startQuiz={startQuiz}
            reset={reset}
            handleAnswer={handleAnswer}
            nextQuestion={nextQuestion}
            selectedAnswer={selectedAnswer}
            showFeedback={showFeedback}
            adaptiveFeedback={adaptiveFeedback}
            showSettings={showSettings}
          />
        )}
      </main>
    </div>
  );
}

function StudentDashboard({ 
  profile, 
  quizState, 
  isGenerating, 
  topic, 
  setTopic, 
  difficulty, 
  setDifficulty, 
  startQuiz, 
  reset, 
  handleAnswer, 
  nextQuestion, 
  selectedAnswer, 
  showFeedback, 
  adaptiveFeedback,
  showSettings
}: any) {
  const isBasicUser = profile?.computerProficiency === ComputerProficiency.BASIC;
  const isAdvancedUser = profile?.computerProficiency === ComputerProficiency.ADVANCED;

  const [feedback, setFeedback] = useState<TeacherFeedback[]>([]);
  const [showFeedbackList, setShowFeedbackList] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'feedback'), 
      where('studentId', '==', profile.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFeedback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeacherFeedback)));
    });
    return () => unsubscribe();
  }, [profile]);

  return (
    <div className={cn("w-full", isAdvancedUser ? "max-w-4xl" : "max-w-2xl")}>
      {showSettings && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 mb-8 border-brand-200 bg-brand-50/50">
          <h2 className="font-bold mb-4 flex items-center gap-2"><Settings size={18} /> Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-500 mb-2">Logged in as: <span className="font-bold">{profile.email}</span></p>
              <p className="text-sm text-slate-500">Computer Progress: <span className="font-bold">{profile.computerTopicProgress}%</span></p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex justify-end mb-6">
        <button 
          onClick={() => setShowFeedbackList(!showFeedbackList)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-sm font-bold text-slate-600 shadow-sm"
        >
          <MessageSquare size={18} className="text-brand-600" />
          Teacher Feedback ({feedback.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {showFeedbackList ? (
          <motion.div key="feedback" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold">Feedback from Teachers</h2>
              <button onClick={() => setShowFeedbackList(false)} className="text-sm font-bold text-brand-600 hover:underline">Back to Dashboard</button>
            </div>
            {feedback.length === 0 ? (
              <div className="glass-card p-12 text-center text-slate-400">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                <p>No feedback received yet. Keep learning!</p>
              </div>
            ) : (
              feedback.map((f) => (
                <div key={f.id} className="glass-card p-6 border-l-4 border-l-brand-600">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-brand-100 p-2 rounded-lg text-brand-600">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{f.teacherName}</p>
                        <p className="text-xs text-slate-400">{f.timestamp?.toDate().toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-black text-brand-600 uppercase tracking-widest mb-1">Review</p>
                      <p className="text-slate-700 leading-relaxed">{f.content}</p>
                    </div>
                    {f.suggestions && (
                      <div className="bg-brand-50 p-4 rounded-xl border border-brand-100">
                        <p className="text-xs font-black text-brand-600 uppercase tracking-widest mb-1">Suggestions</p>
                        <p className="text-slate-700 text-sm italic">"{f.suggestions}"</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </motion.div>
        ) : !quizState ? (
          <motion.div key="setup" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="space-y-8">
            <div className="glass-card p-8 bg-gradient-to-br from-brand-600 to-brand-800 text-white border-none">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                  <Cpu size={48} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold mb-1">Featured Topic: Computer Science</h2>
                  <p className="text-brand-100 mb-4 text-sm">Master this topic to automatically upgrade your computer proficiency level!</p>
                  <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-white" style={{ width: `${profile?.computerTopicProgress}%` }} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-200">{profile?.computerTopicProgress}% towards next level</p>
                </div>
                <button onClick={() => startQuiz('Computer Basics')} className="bg-white text-brand-700 px-6 py-3 rounded-xl font-bold hover:bg-brand-50 transition-colors shadow-lg">
                  Learn Now
                </button>
              </div>
            </div>

            <div className="glass-card p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Explore any other topic</label>
                  <div className="relative">
                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. History, Biology, Cooking..."
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Quiz Difficulty</label>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.values(Difficulty).map((d: any) => (
                      <button key={d} onClick={() => setDifficulty(d)} className={cn(
                        "py-3 rounded-xl border-2 transition-all font-bold",
                        difficulty === d ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-100 bg-slate-50 text-slate-500"
                      )}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={() => startQuiz()} disabled={!topic.trim() || isGenerating} className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2">
                  {isGenerating ? <><Loader2 className="animate-spin" size={24} /> Generating...</> : <><Sparkles size={20} /> Create Custom Quiz</>}
                </button>
              </div>
            </div>
          </motion.div>
        ) : quizState.isComplete ? (
          <motion.div key="results" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card p-8 text-center">
            <div className="inline-flex items-center justify-center p-4 bg-yellow-100 text-yellow-600 rounded-full mb-6">
              <Trophy size={48} />
            </div>
            <h2 className="text-3xl font-bold mb-2">Excellent Work!</h2>
            <p className="text-slate-500 mb-8 text-lg">You scored <span className="font-bold text-brand-600">{quizState.score}</span> / {quizState.questions.length}</p>
            
            <div className="bg-slate-50 rounded-2xl p-6 text-left mb-8 border border-slate-100">
              <div className="flex items-center gap-2 mb-4 text-brand-600 font-bold"><Sparkles size={18} /> AI Feedback</div>
              <div className="prose prose-slate prose-sm max-w-none"><Markdown>{adaptiveFeedback || ''}</Markdown></div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={reset} className="flex-1 btn-secondary py-4 flex items-center justify-center gap-2"><ArrowLeft size={20} /> Back to Dashboard</button>
              <button onClick={() => startQuiz(quizState.topic)} className="flex-1 btn-primary py-4 flex items-center justify-center gap-2"><RefreshCcw size={20} /> Retake Quiz</button>
            </div>
          </motion.div>
        ) : (
          <QuizView quizState={quizState} onAnswer={handleAnswer} onNext={nextQuestion} selectedAnswer={selectedAnswer} showFeedback={showFeedback} isBasicUser={isBasicUser} />
        )}
      </AnimatePresence>
    </div>
  );
}

function TeacherDashboard({ profile }: { profile: UserProfile }) {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [studentHistory, setStudentHistory] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', UserRole.STUDENT));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStudents(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const q = query(
      collection(db, 'quizHistory'), 
      where('uid', '==', selectedStudent.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStudentHistory(snapshot.docs.map(doc => doc.data()));
    });
    return () => unsubscribe();
  }, [selectedStudent]);

  const handleSendFeedback = async () => {
    if (!selectedStudent || !feedbackContent.trim()) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        teacherId: profile.uid,
        teacherName: profile.name,
        studentId: selectedStudent.uid,
        content: feedbackContent,
        suggestions: suggestions,
        timestamp: serverTimestamp()
      });
      setFeedbackContent('');
      setSuggestions('');
      alert('Feedback sent successfully!');
      setView('list');
      setSelectedStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'feedback');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full max-w-5xl">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Student Directory</h1>
                <p className="text-slate-500">Monitor progress and provide feedback to your students.</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                <Users className="text-brand-600" size={20} />
                <span className="font-bold text-slate-700">{students.length} Students</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {students.map((student) => (
                <motion.div 
                  key={student.uid} 
                  whileHover={{ y: -4 }}
                  onClick={() => { setSelectedStudent(student); setView('detail'); }}
                  className="glass-card p-6 cursor-pointer hover:border-brand-300 transition-all group"
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-brand-100 p-3 rounded-2xl text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{student.name}</h3>
                      <p className="text-xs text-slate-400">{student.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proficiency</p>
                      <p className="text-sm font-bold text-slate-700">{student.computerProficiency}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Points</p>
                      <p className="text-sm font-bold text-brand-600">{student.totalPoints}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm font-bold text-brand-600">
                    <span>View Progress</span>
                    <ChevronRight size={18} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <button onClick={() => setView('list')} className="flex items-center gap-2 text-slate-500 hover:text-brand-600 font-bold transition-colors">
                <ArrowLeft size={20} /> Back to Students
              </button>
              
              <div className="glass-card p-8">
                <div className="text-center mb-8">
                  <div className="bg-brand-100 p-6 rounded-3xl text-brand-600 inline-flex mb-4">
                    <User size={48} />
                  </div>
                  <h2 className="text-2xl font-bold">{selectedStudent?.name}</h2>
                  <p className="text-slate-500">{selectedStudent?.email}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3 text-slate-500">
                      <TrendingUp size={18} />
                      <span className="text-sm font-semibold">Proficiency</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedStudent?.computerProficiency}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3 text-slate-500">
                      <Award size={18} />
                      <span className="text-sm font-semibold">Total Points</span>
                    </div>
                    <span className="font-bold text-brand-600">{selectedStudent?.totalPoints}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3 text-slate-500">
                      <History size={18} />
                      <span className="text-sm font-semibold">Quizzes</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedStudent?.quizzesCompleted}</span>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History size={16} /> Recent Activity
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {studentHistory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No quiz history yet.</p>
                    ) : (
                      studentHistory.map((h, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-bold text-slate-800 truncate pr-2">{h.topic}</p>
                            <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                              {h.score}/{h.totalQuestions}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">{h.timestamp?.toDate().toLocaleDateString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-brand-600 p-2 rounded-lg text-white">
                    <MessageSquare size={20} />
                  </div>
                  <h2 className="text-xl font-bold">Provide Feedback</h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">General Review</label>
                    <textarea 
                      value={feedbackContent}
                      onChange={(e) => setFeedbackContent(e.target.value)}
                      placeholder="How is the student performing? What areas need focus?"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none min-h-[150px] resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Learning Suggestions</label>
                    <input 
                      type="text"
                      value={suggestions}
                      onChange={(e) => setSuggestions(e.target.value)}
                      placeholder="e.g. Try focusing on 'Network Protocols' next."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>

                  <button 
                    onClick={handleSendFeedback}
                    disabled={!feedbackContent.trim() || isSending}
                    className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                  >
                    {isSending ? <Loader2 className="animate-spin" size={24} /> : <><Send size={20} /> Send Feedback</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card p-12 text-center max-w-md w-full">
        <div className="bg-brand-600 text-white p-4 rounded-3xl inline-flex mb-8 shadow-xl shadow-brand-200">
          <Brain size={48} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Adaptive Learner</h1>
        <p className="text-slate-500 mb-10 text-lg">The AI-powered learning platform that grows with you.</p>
        <button onClick={onLogin} className="w-full bg-white border-2 border-slate-200 hover:border-brand-500 p-4 rounded-2xl flex items-center justify-center gap-4 transition-all font-bold text-slate-700 shadow-sm">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
}

function Assessment({ onComplete }: { onComplete: (p: ComputerProficiency, r: UserRole) => void }) {
  const [step, setStep] = useState(-1); // -1 for role selection
  const [role, setRole] = useState<UserRole>(UserRole.STUDENT);
  const [answers, setAnswers] = useState<number[]>([]);

  const questions = [
    { q: "How often do you use a computer?", options: ["Rarely", "Daily for basic tasks", "I use it for everything"] },
    { q: "Do you know what 'RAM' stands for?", options: ["No idea", "I've heard of it", "Yes, Random Access Memory"] },
    { q: "Can you install a new software program by yourself?", options: ["I need help", "Usually yes", "Easily"] },
    { q: "Do you know how to use keyboard shortcuts like Ctrl+C?", options: ["No", "Some of them", "I use them constantly"] }
  ];

  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === UserRole.TEACHER) {
      // Teachers skip proficiency assessment for now or get advanced by default
      onComplete(ComputerProficiency.ADVANCED, selectedRole);
    } else {
      setStep(0);
    }
  };

  const handleAnswer = (idx: number) => {
    const newAnswers = [...answers, idx];
    if (step < questions.length - 1) {
      setAnswers(newAnswers);
      setStep(step + 1);
    } else {
      const avg = newAnswers.reduce((a, b) => a + b, 0) / questions.length;
      let proficiency = ComputerProficiency.BASIC;
      if (avg >= 1.6) proficiency = ComputerProficiency.ADVANCED;
      else if (avg >= 0.8) proficiency = ComputerProficiency.INTERMEDIATE;
      
      onComplete(proficiency, role);
    }
  };

  if (step === -1) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card p-10 w-full max-w-xl text-center">
          <h2 className="text-3xl font-bold mb-4">Choose Your Role</h2>
          <p className="text-slate-500 mb-8">Are you here to learn or to guide others?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={() => handleRoleSelect(UserRole.STUDENT)}
              className="p-8 border-2 border-slate-100 rounded-3xl hover:border-brand-500 hover:bg-brand-50 transition-all group"
            >
              <div className="bg-brand-100 p-4 rounded-2xl text-brand-600 mb-4 inline-flex group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <BookOpen size={32} />
              </div>
              <h3 className="text-xl font-bold mb-1">Student</h3>
              <p className="text-sm text-slate-400">I want to learn new topics and improve my skills.</p>
            </button>
            <button 
              onClick={() => handleRoleSelect(UserRole.TEACHER)}
              className="p-8 border-2 border-slate-100 rounded-3xl hover:border-brand-500 hover:bg-brand-50 transition-all group"
            >
              <div className="bg-brand-100 p-4 rounded-2xl text-brand-600 mb-4 inline-flex group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <Users size={32} />
              </div>
              <h3 className="text-xl font-bold mb-1">Teacher</h3>
              <p className="text-sm text-slate-400">I want to review student progress and provide feedback.</p>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <motion.div key={step} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="glass-card p-10 w-full max-w-xl">
        <p className="text-xs font-black text-brand-600 uppercase tracking-widest mb-4">Assessment {step + 1}/{questions.length}</p>
        <h2 className="text-2xl font-bold mb-8">{questions[step].q}</h2>
        <div className="space-y-3">
          {questions[step].options.map((opt, idx) => (
            <button key={idx} onClick={() => handleAnswer(idx)} className="w-full p-5 text-left border-2 border-slate-100 rounded-2xl hover:border-brand-500 hover:bg-brand-50 transition-all font-semibold">
              {opt}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function QuizView({ quizState, onAnswer, onNext, selectedAnswer, showFeedback, isBasicUser }: any) {
  const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
  return (
    <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 bg-brand-600 text-white text-xs font-black rounded-full uppercase tracking-widest">{quizState.difficulty}</div>
          <span className="text-sm font-bold text-slate-400">Question {quizState.currentQuestionIndex + 1} / {quizState.questions.length}</span>
        </div>
        <div className="text-lg font-black text-brand-600">{quizState.score * 10} pts</div>
      </div>

      <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden mb-8">
        <motion.div className="h-full bg-brand-500" initial={{ width: 0 }} animate={{ width: `${((quizState.currentQuestionIndex) / quizState.questions.length) * 100}%` }} />
      </div>

      <div className="glass-card p-8 md:p-10">
        <h3 className={cn("font-bold mb-10 leading-relaxed text-slate-800", isBasicUser ? "text-2xl" : "text-xl")}>{currentQuestion.text}</h3>
        <div className="grid grid-cols-1 gap-4">
          {currentQuestion.options.map((option: string, idx: number) => {
            const isSelected = selectedAnswer === option;
            const isCorrect = option === currentQuestion.correctAnswer;
            let btnClass = "w-full p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between";
            if (showFeedback) {
              if (isCorrect) btnClass += " border-green-500 bg-green-50 text-green-700";
              else if (isSelected) btnClass += " border-red-500 bg-red-50 text-red-700";
              else btnClass += " border-slate-100 bg-slate-50 text-slate-400 opacity-50";
            } else {
              btnClass += isSelected ? " border-brand-500 bg-brand-50 text-brand-700" : " border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300";
            }
            return (
              <button key={idx} onClick={() => onAnswer(option)} disabled={showFeedback} className={btnClass}>
                <span className="font-semibold">{option}</span>
                {showFeedback && isCorrect && <CheckCircle2 className="text-green-600" size={24} />}
                {showFeedback && isSelected && !isCorrect && <XCircle className="text-red-600" size={24} />}
              </button>
            );
          })}
        </div>
        {showFeedback && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-10 pt-10 border-t-2 border-slate-100">
            <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-6 mb-8">
              <p className="text-xs font-black text-brand-600 uppercase tracking-widest mb-2">Explanation</p>
              <p className="text-slate-700">{currentQuestion.explanation}</p>
            </div>
            <button onClick={onNext} className="w-full btn-primary py-5 text-lg flex items-center justify-center gap-2">
              {quizState.currentQuestionIndex === quizState.questions.length - 1 ? 'See Results' : 'Continue'} <ChevronRight size={24} />
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

