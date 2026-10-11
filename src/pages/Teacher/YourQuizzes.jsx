import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, deleteDoc, deleteField, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import MediaRenderer from '../../components/MediaRenderer';
import { MiniMedia } from '../../components/AnswerReveal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/layout/PageHeader';
import Skeleton from '@/components/teacher/Skeleton';
import CopyCodeButton from '@/components/teacher/CopyCodeButton';
import { rise, spring, stagger } from '@/lib/motion';
import {
  PiPlusBold, PiEyeBold, PiTrashBold, PiShareNetworkBold, PiPencilSimpleBold, PiDotsThreeVerticalBold,
  PiToggleLeftBold, PiToggleRightBold, PiClipboardTextBold, PiChartBarBold, PiMagnifyingGlassBold,
  PiBroadcastBold, PiSpinnerGapBold, PiCheckBold, PiCopyBold, PiFolderSimpleBold, PiLockSimpleBold, PiLockSimpleOpenBold,
} from 'react-icons/pi';
import { createLiveSession } from '../../utils/liveSession';
import {
  FOLDER_MAX, cloningAllowed, copyQuiz, folderNames, groupByFolder, matchExistingFolder, normalizeFolder,
} from '../../utils/quizCopy';

// ── Question preview inside details modal ──────────────────────────────────────
const QuestionPreview = ({ question, index }) => {
  const mainMedia = question.visualData?.mainMedia || question.listeningData?.mainMedia || question.media;
  return (
    <div className="py-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="tabular w-6 shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{String(index + 1).padStart(2, '0')}</span>
        <Badge variant="secondary">{question.type.replace(/_/g, ' ').toLowerCase()}</Badge>
        <span className="tabular ml-auto text-xs text-[hsl(var(--muted-foreground))]">{question.points} pts</span>
      </div>
      <div className="pl-9">
        {mainMedia && <div className="mb-3 max-h-40 overflow-hidden rounded-lg"><MediaRenderer media={mainMedia} transform="question_main" /></div>}
        <p className="mb-3 text-sm font-medium leading-relaxed text-[hsl(var(--foreground))]">{question.questionText}</p>
        {question.mcqData?.options && (
          <ul className="flex flex-col gap-1">
            {question.mcqData.options.map(opt => {
              const correct = question.mcqData.correctOptions.includes(opt.id);
              return (
                <li key={opt.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${correct ? 'bg-[hsl(var(--tint-green))] font-medium text-[hsl(var(--tint-green-fg))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  <MediaRenderer media={opt.media} transform="thumbnail" />
                  {correct && <PiCheckBold className="h-3.5 w-3.5 shrink-0" aria-label="Correct answer" />}
                  {opt.text}
                </li>
              );
            })}
          </ul>
        )}
        {question.fillBlankData?.answers && (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Answer: {question.fillBlankData.answers.map(a => `"${a.text}"`).join(' / ')}</p>
        )}
        {question.matchData?.pairs && (
          <div className="flex flex-col gap-1.5">
            {question.matchData.pairs.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1 rounded bg-[hsl(var(--muted))] px-2 py-0.5"><MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}</div>
                <span className="text-[hsl(var(--muted-foreground))]" aria-label="matches">to</span>
                <div className="flex items-center gap-1 rounded bg-[hsl(var(--muted))] px-2 py-0.5"><MediaRenderer media={p.answerMedia} transform="thumbnail" />{p.answer}</div>
              </div>
            ))}
          </div>
        )}
        {question.reorderData?.items && (
          <ol className="flex flex-col gap-1">
            {question.reorderData.items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm"><span className="tabular text-[hsl(var(--muted-foreground))]">{i + 1}.</span><MediaRenderer media={item.media} transform="thumbnail" />{item.text}</li>
            ))}
          </ol>
        )}
        {question.categorizeData && question.categorizeData.categories.map(cat => (
          <div key={cat.id} className="mb-1">
            <span className="text-xs font-semibold">{cat.name}: </span>
            <span className="inline-flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              {/* each item keeps its picture, audio or video, not just its text */}
              {question.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => (
                <span key={i.id} className="inline-flex items-center gap-1"><MiniMedia media={i.media} />{i.text}</span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const YourQuizzes = () => {
  const navigate = useNavigate();
  const { currentUser, displayName } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [search, setSearch] = useState('');
  const [detailsQuiz, setDetailsQuiz] = useState(null);
  const [deleteQuiz, setDeleteQuiz] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Duplicate: the id of the quiz being copied, so its menu item can say so and not run twice.
  const [duplicatingId, setDuplicatingId] = useState(null);
  // Folders: which chip is selected, and the "Move to folder" dialog (quiz, typed value, saving).
  const [folderFilter, setFolderFilter] = useState('all');
  const [folderQuiz, setFolderQuiz] = useState(null);
  const [folderValue, setFolderValue] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);

  useEffect(() => {
    if (currentUser) fetchQuizzes();
  }, [currentUser]);

  // `quiet` refreshes the list without swapping it for skeletons (used after a duplicate).
  const fetchQuizzes = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'quizzes'), where('createdBy', '==', currentUser.uid), orderBy('createdAt', 'desc'))
      );
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast.error('Error loading quizzes: ' + e.message); }
    finally { setLoading(false); }
  };

  const [hostingId, setHostingId] = useState(null);

  const handleHostLive = async (quiz) => {
    setHostingId(quiz.id);
    try {
      const pin = await createLiveSession(quiz, currentUser.uid);
      navigate(`/teacher/host/${pin}`);
    } catch (err) {
      toast.error(err.message || 'Failed to start live session.');
    } finally {
      setHostingId(null);
    }
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

  // Duplicate: a draft copy of this quiz with a new code and no results.
  const handleDuplicate = async (quiz) => {
    if (duplicatingId) return;
    setDuplicatingId(quiz.id);
    try {
      const copy = await copyQuiz({
        db, source: quiz, user: { uid: currentUser.uid, name: displayName || currentUser.displayName },
        titleSuffix: ' (copy)', keepFolder: true,
      });
      await fetchQuizzes(true);
      toast.success('Copy created as a draft.', {
        action: { label: 'Open', onClick: () => navigate(`/teacher/edit-quiz/${copy.id}`) },
      });
    } catch (e) { toast.error(e.message || 'We could not duplicate that quiz.'); }
    finally { setDuplicatingId(null); }
  };

  // Folders: open the dialog with the quiz's current folder filled in.
  const openFolderDialog = (quiz) => { setFolderQuiz(quiz); setFolderValue(quiz.folder || ''); };

  // An empty value removes the field, so the quiz goes back to Unfiled.
  const saveFolder = async (e) => {
    e.preventDefault();
    if (!folderQuiz) return;
    const folder = matchExistingFolder(folderValue, folders);
    setSavingFolder(true);
    try {
      await updateDoc(doc(db, 'quizzes', folderQuiz.id), { folder: folder ? folder : deleteField() });
      setQuizzes(qs => qs.map(q => {
        if (q.id !== folderQuiz.id) return q;
        const { folder: _old, ...rest } = q;
        return folder ? { ...rest, folder } : rest;
      }));
      toast.success(folder ? `Moved to ${folder}.` : 'Removed from its folder.');
      setFolderQuiz(null);
    } catch { toast.error('We could not save the folder.'); }
    finally { setSavingFolder(false); }
  };

  // Cloning switch: other teachers see Clone on an open quiz unless this is false.
  const handleToggleCloning = async (quiz) => {
    const next = !cloningAllowed(quiz);
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), { allowCloning: next });
      setQuizzes(qs => qs.map(q => q.id === quiz.id ? { ...q, allowCloning: next } : q));
      toast.success(next ? 'Other teachers can now clone this quiz.' : 'Other teachers can no longer clone this quiz.');
    } catch { toast.error('We could not update that setting.'); }
  };

  const handleShareLink = async (quiz) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/quiz/${quiz.id}`); toast.success('Share link copied.'); }
    catch { toast.error('We could not copy the link.'); }
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return 'No date';
    return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const needle = search.toLowerCase();
  const shown = quizzes.filter(q =>
    !search ||
    q.title?.toLowerCase().includes(needle) ||
    q.description?.toLowerCase().includes(needle)
  );

  // Folders: the names in use, the unfiled count, and the groups to draw. A chip for a folder
  // that has just been emptied no longer exists, so fall back to "All" instead of an empty page.
  const folders = folderNames(quizzes);
  const unfiledCount = quizzes.filter(q => !normalizeFolder(q.folder)).length;
  const activeFilter = folderFilter === 'all' || (folderFilter === 'unfiled' && unfiledCount > 0) || folders.includes(folderFilter) ? folderFilter : 'all';
  const groups = groupByFolder(shown, activeFilter);
  // Headings only appear once the teacher has made a folder, so a plain list stays plain.
  const showHeadings = folders.length > 0;
  const chips = [{ key: 'all', label: 'All' }, ...folders.map(f => ({ key: f, label: f })), ...(folders.length && unfiledCount ? [{ key: 'unfiled', label: 'Unfiled' }] : [])];

  // One quiz row. Kept as a function so every group draws its rows the same way.
  const renderRow = (quiz) => (
    <motion.li
      key={quiz.id}
      layout
      variants={rise}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={spring}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4"
    >
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex items-center gap-2.5">
          <h3 className="truncate font-medium text-[hsl(var(--foreground))]">{quiz.title}</h3>
          <Badge variant={quiz.active ? 'success' : 'secondary'} className="shrink-0">{quiz.active ? 'Active' : 'Draft'}</Badge>
        </div>
        <p className="tabular mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          {quiz.questions?.length || 0} {quiz.questions?.length === 1 ? 'question' : 'questions'}
          <span className="px-1.5">·</span>{quiz.totalPoints || 0} pts
          <span className="px-1.5">·</span>{formatDate(quiz.createdAt)}
          {!cloningAllowed(quiz) && <><span className="px-1.5">·</span>Cloning off</>}
        </p>
      </div>

      <div className="flex items-center gap-0.5">
        <span className="font-mono text-sm tracking-widest text-[hsl(var(--foreground))]">{quiz.code}</span>
        <CopyCodeButton text={quiz.code} label={`Copy code ${quiz.code}`} successMessage="Quiz code copied." />
      </div>

      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="brand" onClick={() => handleHostLive(quiz)} disabled={hostingId === quiz.id}>
          {hostingId === quiz.id ? <PiSpinnerGapBold className="animate-spin" /> : <PiBroadcastBold />}
          Host live game
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Edit ${quiz.title}`} title="Edit quiz" onClick={() => navigate(`/teacher/edit-quiz/${quiz.id}`)}>
          <PiPencilSimpleBold />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`More actions for ${quiz.title}`} title="More actions">
              <PiDotsThreeVerticalBold />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDetailsQuiz(quiz)}><PiEyeBold className="h-4 w-4" /> Preview</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/teacher/grading/${quiz.id}`)}><PiClipboardTextBold className="h-4 w-4" /> Grade</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/teacher/analytics/${quiz.id}`)}><PiChartBarBold className="h-4 w-4" /> Analytics</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleToggle(quiz)}>
              {quiz.active ? <PiToggleLeftBold className="h-4 w-4" /> : <PiToggleRightBold className="h-4 w-4" />}
              {quiz.active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicate(quiz)} disabled={!!duplicatingId}><PiCopyBold className="h-4 w-4" /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openFolderDialog(quiz)}><PiFolderSimpleBold className="h-4 w-4" /> Move to folder</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggleCloning(quiz)}>
              {cloningAllowed(quiz) ? <PiLockSimpleBold className="h-4 w-4" /> : <PiLockSimpleOpenBold className="h-4 w-4" />}
              {cloningAllowed(quiz) ? 'Stop allowing cloning' : 'Allow cloning'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShareLink(quiz)}><PiShareNetworkBold className="h-4 w-4" /> Copy share link</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDeleteQuiz(quiz)} className="text-[hsl(var(--destructive))] focus:bg-[hsl(var(--tint-red))] focus:text-[hsl(var(--destructive))]">
              <PiTrashBold className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.li>
  );

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        eyebrow="Teacher"
        title="Your quizzes"
        description={loading ? undefined : `${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'} created.`}
        actions={<Button onClick={() => navigate('/teacher/home')}><PiPlusBold /> Create quiz</Button>}
      />

      <section aria-label="All quizzes" className="mt-10">
        {/* Search */}
        <div className="relative mb-4 w-full sm:max-w-xs">
          <PiMagnifyingGlassBold aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input aria-label="Search quizzes" placeholder="Search quizzes" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>

        {/* Folder filter. Only shown once at least one folder exists. */}
        {!loading && folders.length > 0 && (
          <div role="group" aria-label="Folder" className="-mx-1 mb-6 flex flex-wrap gap-x-1 gap-y-1">
            {chips.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFolderFilter(c.key)}
                aria-pressed={activeFilter === c.key}
                className={`relative isolate cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${activeFilter === c.key ? 'font-medium text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
              >
                {activeFilter === c.key && <motion.span layoutId="folder-pill" transition={spring} className="absolute inset-0 -z-10 rounded-md bg-[hsl(var(--muted))]" />}
                {c.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : quizzes.length === 0 ? (
          <motion.div variants={rise} initial="hidden" animate="show" className="border-t border-[hsl(var(--border))] pt-8">
            <p className="text-lg font-medium">No quizzes yet.</p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">Create your first quiz to get started.</p>
            <Button className="mt-5" size="lg" onClick={() => navigate('/teacher/home')}><PiPlusBold /> Create quiz</Button>
          </motion.div>
        ) : shown.length === 0 ? (
          <p className="border-t border-[hsl(var(--border))] pt-6 text-sm text-[hsl(var(--muted-foreground))]">No quiz matches that search.</p>
        ) : (
          <div className="space-y-10">
            {groups.map(({ folder, quizzes: inGroup }) => (
              <div key={folder ?? '__unfiled'}>
                {showHeadings && (
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                    <PiFolderSimpleBold aria-hidden="true" className="h-4 w-4 self-center text-[hsl(var(--muted-foreground))]" />
                    {folder ?? 'Unfiled'}
                    <span className="tabular text-xs font-normal text-[hsl(var(--muted-foreground))]">{inGroup.length}</span>
                  </h2>
                )}
                <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                  <AnimatePresence>{inGroup.map(renderRow)}</AnimatePresence>
                </motion.ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Details Dialog */}
      <Dialog open={!!detailsQuiz} onOpenChange={open => !open && setDetailsQuiz(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b border-[hsl(var(--border))]">
            <DialogTitle>{detailsQuiz?.title}</DialogTitle>
            <DialogDescription>{detailsQuiz?.description || 'No description.'}</DialogDescription>
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Badge variant={detailsQuiz?.active ? 'success' : 'secondary'}>{detailsQuiz?.active ? 'Active' : 'Draft'}</Badge>
              <span className="tabular text-xs text-[hsl(var(--muted-foreground))]">{detailsQuiz?.questions?.length} questions · {detailsQuiz?.totalPoints} pts</span>
              <span className="font-mono text-sm tracking-widest text-[hsl(var(--foreground))]">{detailsQuiz?.code}</span>
            </div>
          </DialogHeader>
          <div className="flex-1 divide-y divide-[hsl(var(--border))] overflow-y-auto px-6 pb-4">
            {detailsQuiz?.questions?.map((q, i) => (
              <QuestionPreview key={q.id || i} question={q} index={i} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to folder dialog. An empty value removes the folder. */}
      <Dialog open={!!folderQuiz} onOpenChange={open => !open && setFolderQuiz(null)}>
        <DialogContent className="max-w-sm">
          <form onSubmit={saveFolder}>
            <DialogHeader>
              <DialogTitle>Move to folder</DialogTitle>
              <DialogDescription>
                Pick a folder for <strong>"{folderQuiz?.title}"</strong>, or type a new name. Leave it empty to remove the quiz from its folder.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 px-6 pb-5">
              <label htmlFor="folder-name" className="eyebrow">Folder name</label>
              <Input
                id="folder-name"
                value={folderValue}
                onChange={e => setFolderValue(e.target.value.slice(0, FOLDER_MAX))}
                maxLength={FOLDER_MAX}
                placeholder="For example, Term 1"
                autoComplete="off"
                autoFocus
                className="mt-2"
              />
              <p className="tabular mt-1.5 text-right text-xs text-[hsl(var(--muted-foreground))]">{folderValue.length} of {FOLDER_MAX}</p>
              {folders.length > 0 && (
                <div className="mt-2">
                  <p className="eyebrow">Your folders</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {folders.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFolderValue(f)}
                        aria-pressed={folderValue === f}
                        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${folderValue === f ? 'bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]' : 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))] hover:bg-[hsl(var(--muted))]'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setFolderQuiz(null)}>Cancel</Button>
              <Button type="submit" disabled={savingFolder}>{savingFolder ? 'Saving' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteQuiz} onOpenChange={open => !open && setDeleteQuiz(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiTrashBold className="h-5 w-5 text-[hsl(var(--destructive))]" /> Delete this quiz?
            </DialogTitle>
            <DialogDescription>
              <strong>"{deleteQuiz?.title}"</strong> will be deleted for good. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteQuiz(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YourQuizzes;
