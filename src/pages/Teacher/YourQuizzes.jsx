import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import MediaRenderer from '../../components/MediaRenderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Plus, Eye, Trash2, Copy, Share2,
  BookOpen, MoreVertical,
  ToggleLeft, ToggleRight, ClipboardList, BarChart2, Search,
  Zap, CreditCard,
} from 'lucide-react';

// ── Question preview inside details modal ──────────────────────────────────────
const QuestionPreview = ({ question, index }) => {
  const mainMedia = question.visualData?.mainMedia || question.listeningData?.mainMedia || question.media;
  return (
    <div className="bg-[hsl(var(--muted))]/40 rounded-xl p-4 border border-[hsl(var(--border))]">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-[hsl(var(--primary))] text-white flex items-center justify-center font-bold text-xs shrink-0">{index + 1}</span>
        <Badge variant="outline" className="text-xs">{question.type.replace(/_/g, ' ')}</Badge>
        <span className="ml-auto text-xs font-semibold text-[hsl(var(--muted-foreground))]">{question.points} pts</span>
      </div>
      {mainMedia && <div className="mb-3 rounded-lg overflow-hidden max-h-40"><MediaRenderer media={mainMedia} transform="question_main" /></div>}
      <p className="font-semibold text-sm text-[hsl(var(--foreground))] mb-3 leading-relaxed">{question.questionText}</p>
      {question.mcqData?.options && (
        <ul className="flex flex-col gap-1.5">
          {question.mcqData.options.map(opt => (
            <li key={opt.id} className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg ${question.mcqData.correctOptions.includes(opt.id) ? 'bg-green-50 text-green-700 font-semibold' : 'text-[hsl(var(--muted-foreground))]'}`}>
              <MediaRenderer media={opt.media} transform="thumbnail" />
              {question.mcqData.correctOptions.includes(opt.id) && <span className="text-green-600">✓</span>}
              {opt.text}
            </li>
          ))}
        </ul>
      )}
      {question.fillBlankData?.answers && (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Answer: {question.fillBlankData.answers.map(a => `"${a.text}"`).join(' / ')}</p>
      )}
      {question.matchData?.pairs && (
        <div className="flex flex-col gap-1">
          {question.matchData.pairs.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded"><MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}</div>
              <span>↔</span>
              <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded"><MediaRenderer media={p.answerMedia} transform="thumbnail" />{p.answer}</div>
            </div>
          ))}
        </div>
      )}
      {question.reorderData?.items && (
        <ol className="flex flex-col gap-1">
          {question.reorderData.items.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 text-sm"><span className="text-[hsl(var(--muted-foreground))]">{i + 1}.</span><MediaRenderer media={item.media} transform="thumbnail" />{item.text}</li>
          ))}
        </ol>
      )}
      {question.categorizeData && question.categorizeData.categories.map(cat => (
        <div key={cat.id} className="mb-1">
          <span className="font-semibold text-xs">{cat.name}: </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {question.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => i.text).join(', ')}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const YourQuizzes = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [search, setSearch] = useState('');
  const [detailsQuiz, setDetailsQuiz] = useState(null);
  const [deleteQuiz, setDeleteQuiz] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (currentUser) fetchQuizzes();
  }, [currentUser]);

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'quizzes'), where('createdBy', '==', currentUser.uid), orderBy('createdAt', 'desc'))
      );
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast.error('Error loading quizzes: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleCopyCode = async (code) => {
    try { await navigator.clipboard.writeText(code); toast.success('Quiz code copied!'); }
    catch { toast.error('Failed to copy code.'); }
  };

  const handleToggle = async (quiz) => {
    const next = !quiz.active;
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), { active: next });
      setQuizzes(qs => qs.map(q => q.id === quiz.id ? { ...q, active: next } : q));
      toast.success(`Quiz ${next ? 'activated' : 'deactivated'}.`);
    } catch { toast.error('Error updating quiz status.'); }
  };

  const handleDelete = async () => {
    if (!deleteQuiz) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'quizzes', deleteQuiz.id));
      setQuizzes(qs => qs.filter(q => q.id !== deleteQuiz.id));
      setDeleteQuiz(null);
      toast.success('Quiz deleted.');
    } catch (e) { toast.error('Error deleting quiz: ' + e.message); }
    finally { setDeleting(false); }
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="w-full relative">
      {/* Hero / Page Title */}
      <div className="pb-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-black text-[hsl(var(--foreground))]">Your Quizzes</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''} created</p>
        </motion.div>
      </div>

      {/* Main */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mb-10 rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden"
      >
        <div className="p-6 md:p-8">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))] shrink-0">All Quizzes</h2>
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button onClick={() => navigate('/teacher/home')} variant="default" size="sm"
              className="gap-2 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))] shrink-0 ml-auto">
              <Plus className="w-4 h-4" /> Create New
            </Button>
          </div>

          {quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="font-semibold text-[hsl(var(--foreground))]">No quizzes yet</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 mb-6">Create your first quiz to get started.</p>
              <Button onClick={() => navigate('/teacher/home')}
                className="gap-2 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))]">
                <Plus className="w-4 h-4" /> Create a Quiz
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {quizzes.filter(q =>
                !search ||
                q.title?.toLowerCase().includes(search.toLowerCase()) ||
                q.description?.toLowerCase().includes(search.toLowerCase())
              ).map((quiz, i) => (
                <motion.div key={quiz.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="border border-[hsl(var(--border))] shadow-sm hover:shadow-md transition-all overflow-hidden bg-[hsl(var(--card))] group">
                    <div className={`h-1.5 ${quiz.active ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`} />
                    <CardContent className="pt-4 pb-5">

                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-[hsl(var(--foreground))] leading-snug truncate">{quiz.title}</h3>
                          {quiz.description && (
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-1">{quiz.description}</p>
                          )}
                        </div>
                        <Badge variant={quiz.active ? 'success' : 'secondary'} className="shrink-0">
                          {quiz.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] mb-4">
                        <span>{quiz.questions?.length || 0} questions</span>
                        <span>·</span>
                        <span>{quiz.totalPoints || 0} pts</span>
                        <span>·</span>
                        <span>{formatDate(quiz.createdAt)}</span>
                      </div>

                      <div className="flex items-center justify-between bg-[hsl(var(--muted))] rounded-xl px-3 py-2 mb-4">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">Code</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-[hsl(var(--primary))] tracking-widest">{quiz.code}</span>
                          <button onClick={() => handleCopyCode(quiz.code)}
                            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetailsQuiz(quiz)} className="flex-1 gap-1.5">
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/grading/${quiz.id}`)} className="flex-1 gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5" /> Grade
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/analytics/${quiz.id}`)} className="px-2.5" title="Analytics">
                          <BarChart2 className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="px-2.5">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggle(quiz)} className="gap-2 cursor-pointer">
                              {quiz.active ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                              {quiz.active ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/quiz/${quiz.id}`); toast.success('Share link copied!'); }} className="gap-2 cursor-pointer">
                              <Share2 className="w-4 h-4" /> Copy Share Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/practice/${quiz.id}`)} className="gap-2 cursor-pointer">
                              <Zap className="w-4 h-4" /> Practice Mode
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/flashcards/${quiz.id}`)} className="gap-2 cursor-pointer">
                              <CreditCard className="w-4 h-4" /> Flashcards
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteQuiz(quiz)}
                              className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                              <Trash2 className="w-4 h-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Details Dialog */}
      <Dialog open={!!detailsQuiz} onOpenChange={open => !open && setDetailsQuiz(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-4 border-b border-[hsl(var(--border))]">
            <DialogTitle>{detailsQuiz?.title}</DialogTitle>
            <DialogDescription>{detailsQuiz?.description || 'No description'}</DialogDescription>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Badge variant={detailsQuiz?.active ? 'success' : 'secondary'}>{detailsQuiz?.active ? 'Active' : 'Inactive'}</Badge>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{detailsQuiz?.questions?.length} questions · {detailsQuiz?.totalPoints} pts</span>
              <span className="font-mono font-black text-[hsl(var(--primary))] text-sm bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded border border-[hsl(var(--primary))]/20">{detailsQuiz?.code}</span>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pt-4 flex flex-col gap-3">
            {detailsQuiz?.questions?.map((q, i) => (
              <QuestionPreview key={q.id || i} question={q} index={i} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteQuiz} onOpenChange={open => !open && setDeleteQuiz(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" /> Delete Quiz?
            </DialogTitle>
            <DialogDescription>
              <strong>"{deleteQuiz?.title}"</strong> will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteQuiz(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YourQuizzes;
