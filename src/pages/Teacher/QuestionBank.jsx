import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getBankQuestions, deleteBankQuestion } from '../../utils/questionBankHelpers';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Search, Trash2, BookOpen, Clock, Award, CheckCircle, HelpCircle, Layers, Grid3X3, ArrowUpDown, GitCompare, AlignLeft, BookMarked
} from 'lucide-react';

const QUESTION_TYPES = [
  { value: 'ALL', label: 'All Types' },
  { value: 'MCQ', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'FILL_IN_THE_BLANK', label: 'Fill in the Blank' },
  { value: 'PARAGRAPH', label: 'Paragraph' },
  { value: 'MATCH_THE_FOLLOWING', label: 'Match the Following' },
  { value: 'CATEGORIZE', label: 'Categorize Items' },
  { value: 'REORDER', label: 'Reorder' },
  { value: 'VISUAL_COMPREHENSION', label: 'Visual Comprehension' },
  { value: 'LISTENING_COMPREHENSION', label: 'Listening Comprehension' },
];

const QuestionPreview = ({ question }) => {
  const { type } = question;

  switch (type) {
    case 'MCQ':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Options</p>
          {(question.mcqData?.options || []).map((opt) => {
            const isCorrect = question.mcqData?.correctOptions?.includes(opt.id);
            return (
              <div key={opt.id} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isCorrect ? 'border-green-500 bg-green-500/10 text-green-600' : 'border-slate-300 dark:border-slate-600'}`}>
                  {isCorrect && <CheckCircle className="w-3.5 h-3.5" />}
                </div>
                <span>{opt.text || <span className="italic text-slate-400">Empty option</span>}</span>
              </div>
            );
          })}
        </div>
      );

    case 'TRUE_FALSE':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Correct Answer</p>
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
            {question.trueFalseData?.correctAnswer ? 'True' : 'False'}
          </Badge>
        </div>
      );

    case 'FILL_IN_THE_BLANK':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Accepted Answers</p>
          <div className="flex flex-wrap gap-1.5">
            {(question.fillBlankData?.answers || []).map((ans, idx) => (
              <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-xs">
                {ans.text}
              </Badge>
            ))}
          </div>
        </div>
      );

    case 'PARAGRAPH':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Grading Keywords</p>
          {question.paragraphData?.keywords?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {question.paragraphData.keywords.map((kw, idx) => (
                <Badge key={idx} variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:border-orange-850 dark:text-orange-350 text-xs">
                  {kw.text}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[hsl(var(--muted-foreground))] italic">No grading keywords provided.</p>
          )}
        </div>
      );

    case 'MATCH_THE_FOLLOWING':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Matching Pairs</p>
          {(question.matchData?.pairs || []).map((pair) => (
            <div key={pair.id} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700">{pair.prompt}</span>
              <span className="text-[hsl(var(--muted-foreground))]">➔</span>
              <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700">{pair.answer}</span>
            </div>
          ))}
        </div>
      );

    case 'CATEGORIZE':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Categories & Items</p>
          {(question.categorizeData?.categories || []).map((cat) => {
            const items = (question.categorizeData?.items || []).filter(item => item.categoryId === cat.id);
            return (
              <div key={cat.id} className="text-sm">
                <span className="font-semibold text-xs text-[hsl(var(--primary))]">{cat.name}:</span>
                <div className="flex flex-wrap gap-1 mt-1 pl-2">
                  {items.map(item => (
                    <Badge key={item.id} variant="secondary" className="text-xs font-normal">
                      {item.text}
                    </Badge>
                  ))}
                  {items.length === 0 && <span className="text-xs text-[hsl(var(--muted-foreground))] italic">No items assigned</span>}
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'REORDER':
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Correct Order</p>
          <div className="flex flex-col gap-1">
            {(question.reorderData?.items || []).map((item, idx) => (
              <div key={item.id || idx} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                <span className="text-xs text-[hsl(var(--muted-foreground))] font-bold w-4">{idx + 1}.</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      const sqs = question.visualData?.subQuestions || question.listeningData?.subQuestions || [];
      return (
        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Sub-questions ({sqs.length})</p>
          <div className="flex flex-col gap-2">
            {sqs.map((subQ, idx) => (
              <div key={subQ.id || idx} className="text-sm bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50">
                <p className="font-medium text-xs text-[hsl(var(--foreground))]">Q{idx + 1}: {subQ.questionText}</p>
                <QuestionPreview question={subQ} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
};

const QuestionBank = () => {
  const { currentUser } = useAuth();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const fetchQuestions = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const list = await getBankQuestions(currentUser.uid);
      // Sort by savedAt or fallback to id
      setQuestions(list.sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load question bank.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleDeleteQuestion = async (id, text) => {
    const displayTitle = text ? `"${text.substring(0, 30)}..."` : 'this question';
    if (!window.confirm(`Are you sure you want to delete ${displayTitle} from your question bank?`)) return;

    try {
      await deleteBankQuestion(id);
      toast.success('Question deleted from bank.');
      fetchQuestions();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete question.');
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchText = (q.questionText || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'ALL' || q.type === filterType;
    return matchText && matchType;
  });

  return (
    <div className="w-full relative">
      {/* Hero / Page Title */}
      <div className="pb-6">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-black text-[hsl(var(--foreground))]">Question Bank</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Store, organize, and reuse questions across multiple quizzes.</p>
        </motion.div>
      </div>

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mb-10 rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden"
      >
        <div className="p-6 md:p-8">

          {/* Filters and Toolbar */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search questions by text..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] text-sm placeholder:text-[hsl(var(--muted-foreground))] transition focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/20"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider whitespace-nowrap">Filter by Type:</span>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] text-sm focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/20 transition"
              >
                {QUESTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Toolbar Stats */}
          <div className="flex items-center justify-between mb-4 border-b border-[hsl(var(--border))] pb-3">
            <h2 className="text-sm font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
              {filteredQuestions.length} Question{filteredQuestions.length !== 1 ? 's' : ''} Found
            </h2>
          </div>

          {/* Questions List */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="font-semibold text-[hsl(var(--foreground))]">No questions found</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {questions.length === 0
                  ? 'Save questions when creating a quiz to build your question bank.'
                  : 'Try adjusting your search query or type filter.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {filteredQuestions.map((q, i) => (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <Card className="border border-[hsl(var(--border))] shadow-sm hover:shadow-md bg-[hsl(var(--card))] transition-all overflow-hidden relative">
                      <div className="h-1 bg-[hsl(var(--primary))]" />
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Question Header Meta */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Badge className="bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/15 border border-[hsl(var(--primary))]/20 text-xs font-semibold capitalize">
                                {q.type.replace(/_/g, ' ').toLowerCase()}
                              </Badge>
                              <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-3">
                                <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5" /> {q.points || 10} pts</span>
                                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {q.timeLimit || 60}s</span>
                              </div>
                            </div>

                            {/* Question Text */}
                            <p className="font-semibold text-base text-[hsl(var(--foreground))] leading-snug">
                              {q.questionText || <span className="italic text-slate-400">Untitled Question</span>}
                            </p>

                            {/* Type Specific Previews */}
                            <QuestionPreview question={q} />
                          </div>

                          {/* Delete Action Button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteQuestion(q.id, q.questionText)}
                            className="text-[hsl(var(--muted-foreground))] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0 self-start p-2 rounded-xl"
                            title="Delete question from bank"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};

export default QuestionBank;
