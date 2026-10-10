import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { rise, spring, stagger } from '@/lib/motion';
import '../../styles/Teacher/CreateQuiz.css';
import {
    PiArrowLeftBold, PiCaretUpBold, PiClipboardBold, PiClipboardTextBold, PiDatabaseBold, PiDotsSixVerticalBold,
    PiFloppyDiskBold, PiHeadphonesBold, PiImageBold, PiImagesBold, PiLaptopBold, PiListChecksBold, PiListNumbersBold,
    PiPlusBold, PiSpinnerGapBold, PiSquaresFourBold, PiArrowsLeftRightBold, PiTextAlignLeftBold, PiTextTBold,
    PiToggleLeftBold, PiTrashBold, PiWarningCircleBold, PiXBold,
} from 'react-icons/pi';
import { toast } from 'sonner';
import { saveToBank, getBankQuestions, cleanQuestionForFirestore } from '../../utils/questionBankHelpers';
import MediaPreview from '../../components/MediaPreview';
import ImageEditorModal from '../../components/ImageEditorModal';
import { uploadQuestionMedia } from '../../utils/mediaUpload';

const DRAFT_KEY = 'quizlike_create_quiz_draft';

const generateNewQuestion = (type) => {
    const baseQuestion = { id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, type, questionText: '', points: 10, timeLimit: 60, media: null, localMediaFile: null, localCropData: null };
    switch (type) {
        case 'MCQ': return { ...baseQuestion, mcqData: { options: [{ id: Date.now() + 1, text: '', media: null, localMediaFile: null, localCropData: null }, { id: Date.now() + 2, text: '', media: null, localMediaFile: null, localCropData: null }], correctOptions: [] } };
        case 'TRUE_FALSE': return { ...baseQuestion, trueFalseData: { correctAnswer: true } };
        case 'FILL_IN_THE_BLANK': return { ...baseQuestion, fillBlankData: { answers: [{ text: '' }], caseSensitive: false } };
        case 'PARAGRAPH': return { ...baseQuestion, paragraphData: { keywords: [{ text: '' }] } };
        case 'MATCH_THE_FOLLOWING': return { ...baseQuestion, points: 20, matchData: { pairs: [{ id: Date.now(), prompt: '', promptMedia: null, promptLocalMediaFile: null, promptLocalCropData: null, answer: '', answerMedia: null, answerLocalMediaFile: null, answerLocalCropData: null }] } };
        case 'CATEGORIZE': return { ...baseQuestion, points: 20, categorizeData: { categories: [{ id: Date.now(), name: 'Category 1' }], items: [{ id: Date.now() + 1, text: '', categoryId: null, media: null, localMediaFile: null, localCropData: null }] } };
        case 'REORDER': return { ...baseQuestion, reorderData: { items: [{ id: Date.now(), text: '', media: null, localMediaFile: null, localCropData: null }] } };
        case 'VISUAL_COMPREHENSION': return { ...baseQuestion, points: 20, visualData: { mainMedia: null, localMainMediaFile: null, localCropData: null, subQuestions: [generateNewQuestion('MCQ')] } };
        case 'LISTENING_COMPREHENSION': return { ...baseQuestion, points: 20, listeningData: { mainMedia: null, localMainMediaFile: null, subQuestions: [generateNewQuestion('MCQ')] } };
        default: return { ...baseQuestion, mcqData: { options: [{ id: Date.now() + 1, text: '', media: null, localMediaFile: null, localCropData: null }, { id: Date.now() + 2, text: '', media: null, localMediaFile: null, localCropData: null }], correctOptions: [] } };
        }
    };

/** Every question type: its label and a Phosphor icon, used by the type menus and the add row. */
const QUESTION_TYPES = [
    { value: 'MCQ', label: 'Multiple choice', Icon: PiListChecksBold },
    { value: 'TRUE_FALSE', label: 'True or false', Icon: PiToggleLeftBold },
    { value: 'FILL_IN_THE_BLANK', label: 'Fill in the blank', Icon: PiTextTBold },
    { value: 'PARAGRAPH', label: 'Paragraph', Icon: PiTextAlignLeftBold },
    { value: 'MATCH_THE_FOLLOWING', label: 'Match the following', Icon: PiArrowsLeftRightBold },
    { value: 'CATEGORIZE', label: 'Categorize', Icon: PiSquaresFourBold },
    { value: 'REORDER', label: 'Reorder', Icon: PiListNumbersBold },
    { value: 'VISUAL_COMPREHENSION', label: 'Visual comprehension', Icon: PiImageBold },
    { value: 'LISTENING_COMPREHENSION', label: 'Listening comprehension', Icon: PiHeadphonesBold },
];
const typeLabel = (type) => QUESTION_TYPES.find(t => t.value === type)?.label || type;

const UploadChoiceModal = ({ onChoice, onClose }) => (
    <div className="upload-choice-modal-overlay" onClick={onClose}>
        <div className="upload-choice-modal-content" role="dialog" aria-modal="true" aria-label="Add media" onClick={(e) => e.stopPropagation()}>
            <h3>Add media</h3>
            <p>Choose how you want to add your file.</p>
            <div className="upload-choices">
                <button type="button" onClick={() => onChoice('upload')} className="upload-choice-btn"><PiLaptopBold /><span>Upload from computer</span></button>
                <button type="button" onClick={() => onChoice('paste')} className="upload-choice-btn"><PiClipboardBold /><span>Paste from clipboard</span></button>
            </div>
            <button type="button" className="close-modal-btn-simple" onClick={onClose} aria-label="Close"><PiXBold /></button>
        </div>
    </div>
);

const CreateQuiz = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { quizId } = useParams();
    const isEditMode = !!quizId;
    const { currentUser } = useAuth();

    const [quizType, setQuizType] = useState(location.state?.quizType || 'MIXED');
    const [userDisplayName, setUserDisplayName] = useState('');
    const [loading, setLoading] = useState(true);
    const [fetchingQuiz, setFetchingQuiz] = useState(isEditMode);
    const [originalQuiz, setOriginalQuiz] = useState(null);
    const [quizTitle, setQuizTitle] = useState('');
    const [quizDescription, setQuizDescription] = useState('');
    const [quizSubject, setQuizSubject] = useState('');
    const [quizTags, setQuizTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [questions, setQuestions] = useState([generateNewQuestion(location.state?.quizType && location.state.quizType !== 'MIXED' ? location.state.quizType : 'MCQ')]);
    const [isPublished, setIsPublished] = useState(false);
    const [generatedCode, setGeneratedCode] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Which question is open for editing. undefined means the first one, 'none' means all are folded.
    const [activeId, setActiveId] = useState();

    const [editorState, setEditorState] = useState({ isOpen: false, imageSrc: null, target: null });

    const [savingToBankId, setSavingToBankId] = useState(null);
    const [isBankOpen, setIsBankOpen] = useState(false);
    const [bankQuestions, setBankQuestions] = useState([]);
    const [bankSearch, setBankSearch] = useState('');
    const [bankFilterType, setBankFilterType] = useState('ALL');
    const [loadingBank, setLoadingBank] = useState(false);

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [mediaTarget, setMediaTarget] = useState(null);
    const hiddenFileInput = useRef(null);
    const draftRestoredRef = useRef(false);

    // Restore an unsaved draft (e.g. after an accidental refresh) once on mount.
    // Local media File selections can't survive localStorage (not serializable),
    // so only text/structure is recovered - already-uploaded media URLs are kept.
    // Skipped entirely in edit mode - a leftover "create new" draft shouldn't
    // clobber the quiz actually being edited.
    useEffect(() => {
        if (isEditMode) return;
        if (draftRestoredRef.current) return;
        draftRestoredRef.current = true;
        try {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (!saved) return;
            const draft = JSON.parse(saved);
            if (!draft?.questions?.length) return;
            setQuizTitle(draft.quizTitle || '');
            setQuizDescription(draft.quizDescription || '');
            setQuizSubject(draft.quizSubject || '');
            setQuizTags(draft.quizTags || []);
            setQuestions(draft.questions);
            toast.info('Restored your unsaved quiz draft.', {
                action: { label: 'Discard', onClick: () => { localStorage.removeItem(DRAFT_KEY); window.location.reload(); } },
            });
        } catch { /* corrupt or unreadable draft - ignore */ }
    }, []);

    // Autosave the draft to localStorage so a refresh doesn't lose progress.
    // Skipped in edit mode - see restore effect above for why.
    useEffect(() => {
        if (isEditMode) return;
        const hasContent = quizTitle.trim() || questions.some(q => q.questionText?.trim());
        if (!hasContent) return;
        const timer = setTimeout(() => {
            try {
                const cleanedQuestions = questions.map(q => cleanQuestionForFirestore(q));
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    quizTitle, quizDescription, quizSubject, quizTags, questions: cleanedQuestions, savedAt: Date.now(),
                }));
            } catch { /* storage full or serialization issue - skip this save */ }
        }, 800);
        return () => clearTimeout(timer);
    }, [quizTitle, quizDescription, quizSubject, quizTags, questions]);

    useEffect(() => {
        if (currentUser) {
            const fetchUserData = async () => {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                setUserDisplayName(userDocSnap.exists() ? userDocSnap.data().displayName || 'Teacher' : 'Teacher');
                setLoading(false);
            };
            fetchUserData();
        } else {
            setLoading(false);
        }
    }, [currentUser]);

    // Edit mode: load the existing quiz and populate the form. Older quizzes may
    // predate fields like subject/tags/quizType - all default safely when absent.
    useEffect(() => {
        if (!isEditMode || !currentUser) return;
        const fetchQuiz = async () => {
            setFetchingQuiz(true);
            try {
                const snap = await getDoc(doc(db, 'quizzes', quizId));
                if (!snap.exists()) {
                    toast.error('Quiz not found.');
                    navigate('/teacher/your-quizzes');
                    return;
                }
                const data = snap.data();
                if (data.createdBy !== currentUser.uid) {
                    toast.error("You don't have permission to edit this quiz.");
                    navigate('/teacher/your-quizzes');
                    return;
                }
                setOriginalQuiz(data);
                setQuizTitle(data.title || '');
                setQuizDescription(data.description || '');
                setQuizSubject(data.subject || '');
                setQuizTags(data.tags || []);
                setQuizType(data.quizType || 'MIXED');
                setQuestions(data.questions?.length ? data.questions : [generateNewQuestion('MCQ')]);
            } catch (err) {
                console.error('Error loading quiz for edit:', err);
                toast.error('Failed to load quiz.');
                navigate('/teacher/your-quizzes');
            } finally {
                setFetchingQuiz(false);
            }
        };
        fetchQuiz();
    }, [isEditMode, quizId, currentUser, navigate]);

    // NEW: Effect to control body scroll when modal is open
    useEffect(() => {
        if (editorState.isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset'; // Or 'auto'
        }
        // Cleanup function
        return () => {
            document.body.style.overflow = 'unset'; // Ensure it's reset on unmount
        };
    }, [editorState.isOpen]);

    const updateQuestionState = (qIndex, updateCallback) => {
        setQuestions(currentQuestions => currentQuestions.map((q, i) => i === qIndex ? updateCallback(q) : q));
    };

    const handleAddQuestion = (type = quizType === 'MIXED' ? 'MCQ' : quizType) => {
        const added = generateNewQuestion(type);
        setQuestions(current => [...current, added]);
        setActiveId(added.id);
    };
    const handleRemoveQuestion = (qIndex) => questions.length > 1 && setQuestions(current => current.filter((_, i) => i !== qIndex));
    const handleQuestionChange = (qIndex, field, value) => { updateQuestionState(qIndex, q => ({ ...q, [field]: value })); };
    const handleQuestionTypeChange = (qIndex, newType) => {
        const old = questions[qIndex];
        const newQuestion = { ...generateNewQuestion(newType), id: old.id, questionText: old.questionText, points: old.points, timeLimit: old.timeLimit };
        setQuestions(current => current.map((q, i) => i === qIndex ? newQuestion : q));
    };

    const handleSaveToBank = async (q) => {
        if (!currentUser) {
            toast.error("You must be logged in to save questions.");
            return;
        }
        setSavingToBankId(q.id);
        try {
            // A picked file only exists in memory until publish. It cannot be serialised,
            // so saving the question as is would silently drop its picture, audio or video.
            // Upload first, then save the copy that points at the stored media.
            const [withMedia] = await uploadQuestionMedia([q]);
            await saveToBank(withMedia, currentUser.uid);
            toast.success("Question saved to the question bank");
        } catch (err) {
            console.error(err);
            toast.error("Failed to save question to bank.");
        } finally {
            setSavingToBankId(null);
        }
    };

    const openBankModal = async () => {
        setIsBankOpen(true);
        if (!currentUser) return;
        setLoadingBank(true);
        try {
            const list = await getBankQuestions(currentUser.uid);
            setBankQuestions(list);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load question bank.");
        } finally {
            setLoadingBank(false);
        }
    };

    const handleInsertFromBank = (q) => {
        const newId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const insertedQuestion = {
            ...q,
            id: newId
        };
        delete insertedQuestion.teacherId;
        delete insertedQuestion.savedAt;
        
        setQuestions(current => [...current, insertedQuestion]);
        toast.success("Question inserted");
    };

    const openUploadModal = (target) => { setMediaTarget(target); setIsUploadModalOpen(true); };

    const handleUploadChoice = async (choice) => {
        if (!mediaTarget) return;
        setIsUploadModalOpen(false);
        if (choice === 'upload') {
            hiddenFileInput.current.click();
        }
        else if (choice === 'paste') {
            try {
                const clipboardItems = await navigator.clipboard.read();
                const imageItem = clipboardItems.find(item => item.types.some(type => type.startsWith('image/')));
                if (imageItem) {
                    const blob = await imageItem.getType(imageItem.types.find(t => t.startsWith('image/')));
                    const imageFile = new File([blob], `pasted-image.png`, { type: blob.type });
                    handleEditMedia(mediaTarget, imageFile);
                } else {
                    setError('No image found on clipboard.');
                }
            } catch {
                setError('Could not read image from clipboard. Please grant permission or try uploading.');
            }
        }
    };

    const handleFileInputChange = (event) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            if (file.type && file.type.startsWith('image/')) {
                handleEditMedia(mediaTarget, file);
            } else {
                handleFile(file, null, mediaTarget);
            }
            event.target.value = null;
        }
    };

    const handleEditMedia = (target, fileToEditOverride = null) => {
        const { qIndex, field, oIndex, pairIndex, itemIndex } = target;
        const q = questions[qIndex];
        let fileToEdit = fileToEditOverride;

        if (!fileToEdit) {
            if (field === 'questionMedia') { fileToEdit = q.localMediaFile || q.media; }
            else if (field === 'mcqOptionMedia') { fileToEdit = q.mcqData.options[oIndex].localMediaFile || q.mcqData.options[oIndex].media; }
            else if (field === 'matchPromptMedia') { fileToEdit = q.matchData.pairs[pairIndex].promptLocalMediaFile || q.matchData.pairs[pairIndex].promptMedia; }
            else if (field === 'matchAnswerMedia') { fileToEdit = q.matchData.pairs[pairIndex].answerLocalMediaFile || q.matchData.pairs[pairIndex].answerMedia; }
            else if (field === 'categorizeItemMedia') { fileToEdit = q.categorizeData.items[itemIndex].localMediaFile || q.categorizeData.items[itemIndex].media; }
            else if (field === 'reorderItemMedia') { fileToEdit = q.reorderData.items[itemIndex].localMediaFile || q.reorderData.items[itemIndex].media; }
            else if (field === 'visualMainMedia') { fileToEdit = q.visualData.localMainMediaFile || q.visualData.mainMedia; }
            else if (field === 'listeningMainMedia') {
                setError("Audio/Video files cannot be edited with the image editor.");
                return;
            }
        }

        if (fileToEdit) {
            const isImage = (fileToEdit instanceof File && fileToEdit.type.startsWith('image/')) || (fileToEdit.url && /\.(jpe?g|png|gif|webp|svg)$/i.test(fileToEdit.url));

            if (!isImage) {
                setError("Only image files can be edited with the advanced editor.");
                return;
            }

            console.log("handleEditMedia: fileToEdit found:", fileToEdit);
            const processFileForEditor = (fileObj) => {
                const reader = new FileReader();
                reader.onload = () => {
                    console.log("FileReader onload: setting editorState with imageSrc (snippet):", reader.result.substring(0, 50) + "...");
                    setEditorState({ isOpen: true, imageSrc: reader.result, target });
                };
                reader.onerror = (err) => {
                    console.error("FileReader error:", err);
                    setError("Could not read file for editing.");
                };
                reader.readAsDataURL(fileObj);
            };

            if (fileToEdit.url) {
                console.log("File is from URL, fetching:", fileToEdit.url);
                fetch(fileToEdit.url)
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                        return res.blob();
                    })
                    .then(blob => {
                        console.log("Fetched blob:", blob);
                        const localFile = new File([blob], fileToEdit.name || "image.png", {type: blob.type});
                        processFileForEditor(localFile);
                    })
                    .catch(err => {
                        console.error("Error fetching image for editing:", err);
                        setError("Could not fetch image for editing. Please check network or CORS.");
                    });
            } else if (fileToEdit instanceof File) {
                console.log("File is local File object:", fileToEdit);
                processFileForEditor(fileToEdit);
            } else {
                console.warn("fileToEdit is not a File object nor has a URL:", fileToEdit);
                setError("Invalid media file for editing.");
            }
        } else {
            console.log("handleEditMedia: No fileToEdit found for target:", target);
            setError("No media found to edit.");
        }
    };

    const handleImageEditComplete = (editedFile) => {
        handleFile(editedFile, null, editorState.target);
        setEditorState({ isOpen: false, imageSrc: null, target: null });
    };

    const handleRemoveMedia = () => {
        const target = editorState.target;
        if (!target) return;

        const { qIndex, field, oIndex, pairIndex, itemIndex } = target;
        updateQuestionState(qIndex, q => {
            if (field === 'questionMedia') {
                return { ...q, media: null, localMediaFile: null, localCropData: null };
            } else if (field === 'mcqOptionMedia') {
                const newOptions = q.mcqData.options.map((opt, i) =>
                    i === oIndex ? { ...opt, media: null, localMediaFile: null, localCropData: null } : opt
                );
                return { ...q, mcqData: { ...q.mcqData, options: newOptions } };
            } else if (field === 'matchPromptMedia') {
                const newPairs = q.matchData.pairs.map((p, i) =>
                    i === pairIndex ? { ...p, promptMedia: null, promptLocalMediaFile: null, promptLocalCropData: null } : p
                );
                return { ...q, matchData: { ...q.matchData, pairs: newPairs } };
            } else if (field === 'matchAnswerMedia') {
                const newPairs = q.matchData.pairs.map((p, i) =>
                    i === pairIndex ? { ...p, answerMedia: null, answerLocalMediaFile: null, answerLocalCropData: null } : p
                );
                return { ...q, matchData: { ...q.matchData, pairs: newPairs } };
            } else if (field === 'categorizeItemMedia') {
                const newItems = q.categorizeData.items.map((item, i) =>
                    i === itemIndex ? { ...item, media: null, localMediaFile: null, localCropData: null } : item
                );
                return { ...q, categorizeData: { ...q.categorizeData, items: newItems } };
            } else if (field === 'reorderItemMedia') {
                const newItems = q.reorderData.items.map((item, i) =>
                    i === itemIndex ? { ...item, media: null, localMediaFile: null, localCropData: null } : item
                );
                return { ...q, reorderData: { ...q.reorderData, items: newItems } };
            } else if (field === 'visualMainMedia') {
                return { ...q, visualData: { ...q.visualData, mainMedia: null, localMainMediaFile: null, localCropData: null } };
            } else if (field === 'listeningMainMedia') {
                return { ...q, listeningData: { ...q.listeningData, mainMedia: null, localMainMediaFile: null } };
            }
            return { ...q };
        });
        setEditorState({ isOpen: false, imageSrc: null, target: null });
    };

    const handleFile = (file, cropData, target) => {
        updateQuestionState(target.qIndex, q => {
            const isImage = file.type && file.type.startsWith('image/');

            if (target.field === 'questionMedia') {
                return { ...q, localMediaFile: file, media: null, localCropData: isImage ? cropData : null };
            } else if (target.field === 'mcqOptionMedia') {
                const newOptions = q.mcqData.options.map((opt, i) =>
                    i === target.oIndex ? { ...opt, localMediaFile: file, media: null, localCropData: isImage ? cropData : null } : opt
                );
                return { ...q, mcqData: { ...q.mcqData, options: newOptions } };
            } else if (target.field === 'matchPromptMedia') {
                const newPairs = q.matchData.pairs.map((p, i) =>
                    i === target.pairIndex ? { ...p, promptLocalMediaFile: file, promptMedia: null, promptLocalCropData: isImage ? cropData : null } : p
                );
                return { ...q, matchData: { ...q.matchData, pairs: newPairs } };
            } else if (target.field === 'matchAnswerMedia') {
                const newPairs = q.matchData.pairs.map((p, i) =>
                    i === target.pairIndex ? { ...p, answerLocalMediaFile: file, answerMedia: null, answerLocalCropData: isImage ? cropData : null } : p
                );
                return { ...q, matchData: { ...q.matchData, pairs: newPairs } };
            } else if (target.field === 'categorizeItemMedia') {
                const newItems = q.categorizeData.items.map((item, i) =>
                    i === target.itemIndex ? { ...item, localMediaFile: file, media: null, localCropData: isImage ? cropData : null } : item
                );
                return { ...q, categorizeData: { ...q.categorizeData, items: newItems } };
            } else if (target.field === 'reorderItemMedia') {
                const newItems = q.reorderData.items.map((item, i) =>
                    i === target.itemIndex ? { ...item, localMediaFile: file, media: null, localCropData: isImage ? cropData : null } : item
                );
                return { ...q, reorderData: { ...q.reorderData, items: newItems } };
            } else if (target.field === 'visualMainMedia') {
                return { ...q, visualData: { ...q.visualData, localMainMediaFile: file, mainMedia: null, localCropData: isImage ? cropData : null } };
            } else if (target.field === 'listeningMainMedia') {
                return { ...q, listeningData: { ...q.listeningData, localMainMediaFile: file, mainMedia: null, localCropData: null } };
            }
            return { ...q };
        });
    };

    const handleMCQOptionChange = (qIndex, oIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, mcqData: { ...q.mcqData, options: q.mcqData.options.map((opt, i) => i === oIndex ? { ...opt, text: value } : opt) } })); };
    const handleMCQCorrectToggle = (qIndex, oIndex) => { updateQuestionState(qIndex, q => { const optionId = q.mcqData.options[oIndex].id; const newCorrectOptions = q.mcqData.correctOptions.includes(optionId) ? q.mcqData.correctOptions.filter(id => id !== optionId) : [...q.mcqData.correctOptions, optionId]; return { ...q, mcqData: { ...q.mcqData, correctOptions: newCorrectOptions } }; }); };
    const handleAddMCQOption = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, mcqData: { ...q.mcqData, options: [...q.mcqData.options, { id: Date.now(), text: '', media: null, localMediaFile: null, localCropData: null }] } })); };
    const handleRemoveMCQOption = (qIndex, oIndex) => { if (questions[qIndex].mcqData.options.length <= 2) return; updateQuestionState(qIndex, q => ({ ...q, mcqData: { ...q.mcqData, options: q.mcqData.options.filter((_, i) => i !== oIndex) } })); };
    const handleFillBlankAnswerChange = (qIndex, ansIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, fillBlankData: { ...q.fillBlankData, answers: q.fillBlankData.answers.map((ans, i) => i === ansIndex ? { ...ans, text: value } : ans) } })); };
    const handleAddFillBlankAnswer = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, fillBlankData: { ...q.fillBlankData, answers: [...q.fillBlankData.answers, { text: '' }] } })); };
    const handleRemoveFillBlankAnswer = (qIndex, ansIndex) => { if (questions[qIndex].fillBlankData.answers.length <= 1) return; updateQuestionState(qIndex, q => ({ ...q, fillBlankData: { ...q.fillBlankData, answers: q.fillBlankData.answers.filter((_, i) => i !== ansIndex) } })); };
    const handleParagraphKeywordChange = (qIndex, keyIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, paragraphData: { ...q.paragraphData, keywords: q.paragraphData.keywords.map((key, i) => i === keyIndex ? { ...key, text: value } : key) } })); };
    const handleAddParagraphKeyword = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, paragraphData: { ...q.paragraphData, keywords: [...q.paragraphData.keywords, { text: '' }] } })); };
    const handleRemoveParagraphKeyword = (qIndex, keyIndex) => { updateQuestionState(qIndex, q => ({ ...q, paragraphData: { ...q.paragraphData, keywords: q.paragraphData.keywords.filter((_, i) => i !== keyIndex) } })); };
    const handleMatchPairChange = (qIndex, pairIndex, field, value) => { updateQuestionState(qIndex, q => ({ ...q, matchData: { ...q.matchData, pairs: q.matchData.pairs.map((p, i) => i === pairIndex ? { ...p, [field]: value } : p) } })); };
    const handleAddMatchPair = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, matchData: { ...q.matchData, pairs: [...q.matchData.pairs, { id: Date.now(), prompt: '', answer: '' }] } })); };
    const handleRemoveMatchPair = (qIndex, pIndex) => { if (questions[qIndex].matchData.pairs.length <= 1) return; updateQuestionState(qIndex, q => ({ ...q, matchData: { ...q.matchData, pairs: q.matchData.pairs.filter((_, i) => i !== pIndex) } })); };
    const handleCategoryNameChange = (qIndex, catIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, categorizeData: { ...q.categorizeData, categories: q.categorizeData.categories.map((c, i) => i === catIndex ? { ...c, name: value } : c) } })); };
    const handleAddCategory = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, categorizeData: { ...q.categorizeData, categories: [...q.categorizeData.categories, { id: Date.now(), name: `Category ${q.categorizeData.categories.length + 1}` }] } })); };
    const handleRemoveCategory = (qIndex, catIndex) => { if (questions[qIndex].categorizeData.categories.length <= 1) return; updateQuestionState(qIndex, q => { const catIdToRemove = q.categorizeData.categories[catIndex].id; const newCategories = q.categorizeData.categories.filter((_, i) => i !== catIndex); const newItems = q.categorizeData.items.map(item => item.categoryId === catIdToRemove ? { ...item, categoryId: newCategories[0]?.id || null } : item); return { ...q, categorizeData: { ...q.categorizeData, categories: newCategories, items: newItems } }; }); };
    const handleCategorizeItemChange = (qIndex, itemIndex, field, value) => { updateQuestionState(qIndex, q => ({ ...q, categorizeData: { ...q.categorizeData, items: q.categorizeData.items.map((item, i) => i === itemIndex ? { ...item, [field]: value } : item) } })); };
    const handleAddCategorizeItem = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, categorizeData: { ...q.categorizeData, items: [...q.categorizeData.items, { id: Date.now(), text: '', categoryId: q.categorizeData.categories[0]?.id || null, media: null, localMediaFile: null, localCropData: null }] } })); };
    const handleRemoveCategorizeItem = (qIndex, iIndex) => { if (questions[qIndex].categorizeData.items.length <= 1) return; updateQuestionState(qIndex, q => ({ ...q, categorizeData: { ...q.categorizeData, items: q.categorizeData.items.filter((_, i) => i !== iIndex) } })); };
    const handleReorderItemChange = (qIndex, itemIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, reorderData: { ...q.reorderData, items: q.reorderData.items.map((item, i) => i === itemIndex ? { ...item, text: value } : item) } })); };
    const handleAddReorderItem = (qIndex) => { updateQuestionState(qIndex, q => ({ ...q, reorderData: { ...q.reorderData, items: [...q.reorderData.items, { id: Date.now(), text: '', media: null, localMediaFile: null, localCropData: null }] } })); };
    const handleRemoveReorderItem = (qIndex, iIndex) => { if (questions[qIndex].reorderData.items.length <= 1) return; updateQuestionState(qIndex, q => ({ ...q, reorderData: { ...q.reorderData, items: q.reorderData.items.filter((_, i) => i !== iIndex) } })); };
    const handleAddSubQuestion = (qIndex, compType, subQType) => { updateQuestionState(qIndex, q => ({ ...q, [compType]: { ...q[compType], subQuestions: [...q[compType].subQuestions, generateNewQuestion(subQType)] } })); };
    const handleRemoveSubQuestion = (qIndex, compType, subQIndex) => { updateQuestionState(qIndex, q => ({ ...q, [compType]: { ...q[compType], subQuestions: q[compType].subQuestions.filter((_, i) => i !== subQIndex) } })); };
    const handleSubQuestionChange = (qIndex, compType, subQIndex, field, value) => { updateQuestionState(qIndex, q => ({ ...q, [compType]: { ...q[compType], subQuestions: q[compType].subQuestions.map((subQ, i) => i === subQIndex ? { ...subQ, [field]: value } : subQ) } })); };
    const handleSubMCQOptionChange = (qIndex, compType, subQIndex, oIndex, value) => { updateQuestionState(qIndex, q => ({ ...q, [compType]: { ...q[compType], subQuestions: q[compType].subQuestions.map((sq, i) => i === subQIndex ? { ...sq, mcqData: { ...sq.mcqData, options: sq.mcqData.options.map((opt, optI) => optI === oIndex ? { ...opt, text: value } : opt) } } : sq) } })); };
    const handleSubMCQCorrectToggle = (qIndex, compType, subQIndex, oIndex) => { updateQuestionState(qIndex, q => { const subQ = q[compType].subQuestions[subQIndex]; const optionId = subQ.mcqData.options[oIndex].id; const newCorrectOptions = subQ.mcqData.correctOptions.includes(optionId) ? subQ.mcqData.correctOptions.filter(id => id !== optionId) : [...subQ.mcqData.correctOptions, optionId]; return { ...q, [compType]: { ...q[compType], subQuestions: q[compType].subQuestions.map((sq, i) => i === subQIndex ? { ...sq, mcqData: { ...sq.mcqData, correctOptions: newCorrectOptions } } : sq) } }; }); };


    const handlePublishQuiz = async () => {
        if (!quizTitle) { setError("Please provide a title for your quiz."); return; }
        if (!currentUser) { setError("You must be logged in to publish a quiz."); return; }

        setIsSubmitting(true);
        setError('');

        try {
            // Upload every file the teacher picked and get back copies of the questions
            // that point at the stored media (see utils/mediaUpload.js).
            const questionsToSave = await uploadQuestionMedia(questions);

            const totalPoints = questions.reduce((sum, q) => sum + (parseInt(q.points, 10) || 0), 0);

            if (isEditMode) {
                await updateDoc(doc(db, 'quizzes', quizId), {
                    title: quizTitle,
                    description: quizDescription,
                    subject: quizSubject.trim(),
                    tags: quizTags,
                    quizType,
                    questions: questionsToSave,
                    totalPoints,
                    updatedAt: serverTimestamp(),
                });
                toast.success('Quiz updated');
                navigate('/teacher/your-quizzes');
                return;
            }

            const quizData = {
                title: quizTitle,
                description: quizDescription,
                subject: quizSubject.trim(),
                tags: quizTags,
                code: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').sort(() => 0.5 - Math.random()).join('').slice(0, 6),
                quizType,
                createdBy: currentUser.uid,
                username: userDisplayName,
                createdAt: serverTimestamp(),
                active: true,
                questions: questionsToSave,
                totalPoints,
            };

            await addDoc(collection(db, "quizzes"), quizData);
            setGeneratedCode(quizData.code);
            setIsPublished(true);
            localStorage.removeItem(DRAFT_KEY);

        } catch (e) {
            console.error(isEditMode ? "Error saving changes:" : "Error publishing:", e);
            setError(`An error occurred while ${isEditMode ? 'saving changes' : 'publishing'}: ${e.message || 'Unknown error'}. Please try again.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading || fetchingQuiz) return <div className="loading-screen" role="status">Loading</div>;

    const openId = activeId === 'none' ? null : (questions.find(q => q.id === activeId)?.id ?? questions[0]?.id);
    const addTypes = quizType === 'MIXED' ? QUESTION_TYPES : QUESTION_TYPES.filter(t => t.value === quizType);

    return (
        <div className="create-quiz-container">
            <input type="file" ref={hiddenFileInput} style={{ display: 'none' }} onChange={handleFileInputChange} accept="image/*,video/*,audio/*" />
            {isUploadModalOpen && (<UploadChoiceModal onChoice={handleUploadChoice} onClose={() => setIsUploadModalOpen(false)} />)}

            {editorState.isOpen && (
                <ImageEditorModal
                    imageSrc={editorState.imageSrc}
                    onEditComplete={handleImageEditComplete}
                    onClose={() => setEditorState({ isOpen: false })}
                    onDelete={handleRemoveMedia}
                />
            )}

            <div className="create-quiz-content">
                {!isPublished ? (
                    <>
                        <PageHeader
                            eyebrow={isEditMode && originalQuiz?.code ? `Editing, code ${originalQuiz.code}` : 'Quiz editor'}
                            title={isEditMode ? 'Edit quiz' : 'New quiz'}
                            actions={(
                                <>
                                    <Button type="button" variant="ghost" onClick={() => navigate(isEditMode ? '/teacher/your-quizzes' : '/teacher/home')}>
                                        <PiArrowLeftBold /> {isEditMode ? 'Your quizzes' : 'Dashboard'}
                                    </Button>
                                    <Button type="button" variant="brand" onClick={handlePublishQuiz} disabled={isSubmitting}>
                                        {isSubmitting ? <PiSpinnerGapBold className="animate-spin" /> : <PiFloppyDiskBold />}
                                        {isSubmitting ? (isEditMode ? 'Saving' : 'Publishing') : (isEditMode ? 'Save changes' : 'Publish')}
                                    </Button>
                                </>
                            )}
                        />
                        {error && <div className="error-message" role="alert"><PiWarningCircleBold /> {error}</div>}

                        <motion.section variants={rise} initial="hidden" animate="show" className="quiz-form-section" aria-label="Quiz details">
                            <h3>Details</h3>
                            <div className="form-group">
                                <label htmlFor="quiz-title">Quiz title</label>
                                <input id="quiz-title" type="text" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Chapter 5: Photosynthesis" className="form-control form-control-title" />
                            </div>
                            <div className="form-group">
                                <label htmlFor="quiz-description">Description</label>
                                <textarea id="quiz-description" value={quizDescription} onChange={(e) => setQuizDescription(e.target.value)} placeholder="A short summary for your students" className="form-control" rows="2" />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="quiz-subject">Subject</label>
                                    <input
                                        id="quiz-subject"
                                        type="text"
                                        value={quizSubject}
                                        onChange={(e) => setQuizSubject(e.target.value)}
                                        placeholder="Mathematics, science or history"
                                        className="form-control"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="quiz-tags">Tags</label>
                                    <div className="tags-input-wrapper">
                                        {quizTags.map((tag, idx) => (
                                            <span key={idx} className="tag-chip">
                                                {tag}
                                                <button
                                                    type="button"
                                                    className="tag-chip-remove"
                                                    onClick={() => setQuizTags(quizTags.filter((_, i) => i !== idx))}
                                                    aria-label={`Remove tag ${tag}`}
                                                >
                                                    <PiXBold />
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            id="quiz-tags"
                                            type="text"
                                            className="tags-text-input"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                                                    e.preventDefault();
                                                    const newTag = tagInput.trim().replace(/,$/, '');
                                                    if (newTag && !quizTags.includes(newTag)) {
                                                        setQuizTags([...quizTags, newTag]);
                                                    }
                                                    setTagInput('');
                                                } else if (e.key === 'Backspace' && !tagInput && quizTags.length > 0) {
                                                    setQuizTags(quizTags.slice(0, -1));
                                                }
                                            }}
                                            placeholder={quizTags.length === 0 ? 'Type a tag, then press Enter' : 'Add more'}
                                        />
                                    </div>
                                </div>
                            </div>
                        </motion.section>

                        <section className="quiz-questions-section" aria-label="Questions">
                            <div className="section-title-row">
                                <h3>Questions</h3>
                                <p className="eyebrow tabular">{questions.length} {questions.length === 1 ? 'question' : 'questions'}</p>
                            </div>
                            <ul className="question-list">
                                <AnimatePresence initial={false}>
                                    {questions.map((q, qIndex) => {
                                        const isOpen = q.id === openId;
                                        return (
                                        <motion.li
                                            key={q.id}
                                            layout="position"
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, transition: { duration: 0.12 } }}
                                            transition={spring}
                                            className={isOpen ? 'question-card' : 'question-row'}
                                        >
                                        {!isOpen ? (
                                            <button type="button" className="question-row-btn" aria-expanded="false" onClick={() => setActiveId(q.id)}>
                                                <span className="question-row-number tabular">{qIndex + 1}</span>
                                                <span className="question-row-type">{typeLabel(q.type)}</span>
                                                <span className={`question-row-text${q.questionText ? '' : ' is-empty'}`}>{q.questionText || 'Untitled question'}</span>
                                                <span className="question-row-points tabular">{q.points} pts</span>
                                            </button>
                                        ) : (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                                    <div className="question-header">
                                        <button type="button" className="question-collapse-btn" aria-expanded="true" onClick={() => setActiveId('none')}>
                                            <span className="question-row-number tabular">{qIndex + 1}</span>
                                            <span className="question-header-title">Question {qIndex + 1}</span>
                                            <PiCaretUpBold aria-hidden="true" />
                                        </button>
                                        <div className="question-controls">
                                            {quizType === 'MIXED' && (
                                                <select value={q.type} onChange={(e) => handleQuestionTypeChange(qIndex, e.target.value)} className="question-type-select" aria-label="Question type">
                                                    {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                </select>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleSaveToBank(q)}
                                                className="save-bank-btn"
                                                disabled={savingToBankId === q.id}
                                                title="Save to the question bank"
                                            >
                                                {savingToBankId === q.id ? 'Saving' : 'Save to bank'}
                                            </button>
                                            <button onClick={() => handleRemoveQuestion(qIndex)} className="remove-item-btn" type="button" aria-label={`Delete question ${qIndex + 1}`} title="Delete question" disabled={questions.length === 1}><PiTrashBold /></button>
                                        </div>
                                    </div>
                                    <div className="question-main-content">
                                        <div className="question-text-and-media">
                                            <textarea value={q.questionText} onChange={(e) => handleQuestionChange(qIndex, 'questionText', e.target.value)} placeholder="Type your question or instruction here" aria-label={`Question ${qIndex + 1} text`} className="form-control question-textarea"/>
                                            {q.type !== 'MATCH_THE_FOLLOWING' && q.type !== 'CATEGORIZE' && (
                                                <div className="main-media-controls">
                                                    {(q.media || q.localMediaFile || q.visualData?.mainMedia || q.visualData?.localMainMediaFile || q.listeningData?.mainMedia || q.listeningData?.localMainMediaFile) ?
                                                    (<MediaPreview
                                                        file={q.localMediaFile || q.media || q.visualData?.localMainMediaFile || q.visualData?.mainMedia || q.listeningData?.localMainMediaFile || q.listeningData?.mainMedia}
                                                        cropData={q.localCropData || q.media?.cropData || q.visualData?.localCropData || q.visualData?.mainMedia?.cropData}
                                                        onEdit={() => {
                                                            const target = { qIndex, field: q.type.includes('COMPREHENSION') ? (q.type === 'VISUAL_COMPREHENSION' ? 'visualMainMedia' : 'listeningMainMedia') : 'questionMedia' };
                                                            handleEditMedia(target);
                                                        }}
                                                    />) :
                                                    (<button type="button" className="add-media-btn" onClick={() => openUploadModal({ qIndex, field: q.type.includes('COMPREHENSION') ? (q.type === 'VISUAL_COMPREHENSION' ? 'visualMainMedia' : 'listeningMainMedia') : 'questionMedia' })}><PiImagesBold/> Add media</button>)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="question-settings">
                                            <div className="form-group">
                                                <label htmlFor={`points-${q.id}`}>Points</label>
                                                <input id={`points-${q.id}`} type="number" value={q.points} onChange={(e) => handleQuestionChange(qIndex, 'points', parseInt(e.target.value, 10) || 0)} className="form-control points-input"/>
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor={`time-${q.id}`}>Seconds</label>
                                                <input id={`time-${q.id}`} type="number" value={q.timeLimit} onChange={(e) => handleQuestionChange(qIndex, 'timeLimit', parseInt(e.target.value, 10) || 0)} className="form-control points-input"/>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="question-body">
                                        {q.type === 'MCQ' && q.mcqData && <div className="options-container"><h4>Options (tick every correct answer)</h4>{q.mcqData.options.map((opt, oIndex) => (<div key={opt.id} className="option-item"><input type="checkbox" className="form-check-input" checked={q.mcqData.correctOptions.includes(opt.id)} onChange={() => handleMCQCorrectToggle(qIndex, oIndex)} /><input type="text" value={opt.text} onChange={(e) => handleMCQOptionChange(qIndex, oIndex, e.target.value)} placeholder={`Option ${oIndex + 1}`} className="form-control" />{(opt.media || opt.localMediaFile) ? (<MediaPreview
                                            file={opt.localMediaFile || opt.media}
                                            cropData={opt.localCropData || opt.media?.cropData}
                                            onEdit={() => {
                                                const target = { qIndex, field: 'mcqOptionMedia', oIndex };
                                                handleEditMedia(target);
                                            }}
                                        />) : (<button type="button" aria-label="Add media" className="add-media-btn-small" onClick={() => openUploadModal({ qIndex, field: 'mcqOptionMedia', oIndex })}><PiImagesBold/></button>)}<button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveMCQOption(qIndex, oIndex)} disabled={q.mcqData.options.length <= 2}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddMCQOption(qIndex)}><PiPlusBold/> Add option</button></div>}
                                        {q.type === 'TRUE_FALSE' && q.trueFalseData && <div className="options-container"><h4>Correct answer</h4><div className="option-item" style={{ gap: "1.5rem" }}><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="radio" name={`tf-${q.id}`} checked={q.trueFalseData.correctAnswer === true} onChange={() => handleQuestionChange(qIndex, 'trueFalseData', { correctAnswer: true })} /> True</label><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="radio" name={`tf-${q.id}`} checked={q.trueFalseData.correctAnswer === false} onChange={() => handleQuestionChange(qIndex, 'trueFalseData', { correctAnswer: false })} /> False</label></div></div>}
                                        {q.type === 'FILL_IN_THE_BLANK' && q.fillBlankData && <div className="options-container"><h4>Accepted answers (not case sensitive)</h4>{q.fillBlankData.answers.map((ans, ansIndex) => (<div key={ansIndex} className="option-item"><input type="text" value={ans.text} onChange={(e) => handleFillBlankAnswerChange(qIndex, ansIndex, e.target.value)} placeholder="Accepted answer" className="form-control" /><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveFillBlankAnswer(qIndex, ansIndex)} disabled={q.fillBlankData.answers.length <= 1}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddFillBlankAnswer(qIndex)}><PiPlusBold/> Add answer</button></div>}
                                        {q.type === 'PARAGRAPH' && q.paragraphData && <div className="options-container"><h4>Grading keywords (optional)</h4><p className="input-instruction">Keywords help you grade faster.</p>{q.paragraphData.keywords.map((key, keyIndex) => (<div key={keyIndex} className="option-item"><input type="text" value={key.text} onChange={(e) => handleParagraphKeywordChange(qIndex, keyIndex, e.target.value)} placeholder="Keyword for grading" className="form-control" /><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveParagraphKeyword(qIndex, keyIndex)}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddParagraphKeyword(qIndex)}><PiPlusBold/> Add keyword</button></div>}
                                        {q.type === 'MATCH_THE_FOLLOWING' && q.matchData && <div className="match-following-container"><h4>Matching pairs</h4>{q.matchData.pairs.map((pair, pIndex) => (<div key={pair.id} className="match-pair-item"><PiDotsSixVerticalBold/><div className="match-column">{(pair.promptMedia || pair.promptLocalMediaFile) ? <MediaPreview
                                            file={pair.promptLocalMediaFile || pair.promptMedia}
                                            cropData={pair.promptLocalCropData || pair.promptMedia?.cropData}
                                            onEdit={() => {
                                                const target = { qIndex, field: 'matchPromptMedia', pairIndex: pIndex };
                                                handleEditMedia(target);
                                            }}
                                        /> : <button type="button" aria-label="Add media" className="add-media-btn-small" onClick={() => openUploadModal({ qIndex, field: 'matchPromptMedia', pairIndex: pIndex})}><PiImagesBold/></button>}<input type="text" value={pair.prompt} onChange={e => handleMatchPairChange(qIndex, pIndex, 'prompt', e.target.value)} placeholder="Prompt" className="form-control"/></div><div className="match-column">{(pair.answerMedia || pair.answerLocalMediaFile) ? <MediaPreview
                                            file={pair.answerLocalMediaFile || pair.answerMedia}
                                            cropData={pair.answerLocalCropData || pair.answerMedia?.cropData}
                                            onEdit={() => {
                                                const target = { qIndex, field: 'matchAnswerMedia', pairIndex: pIndex };
                                                handleEditMedia(target);
                                            }}
                                        /> : <button type="button" aria-label="Add media" className="add-media-btn-small" onClick={() => openUploadModal({ qIndex, field: 'matchAnswerMedia', pairIndex: pIndex})}><PiImagesBold/></button>}<input type="text" value={pair.answer} onChange={e => handleMatchPairChange(qIndex, pIndex, 'answer', e.target.value)} placeholder="Answer" className="form-control"/></div><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveMatchPair(qIndex, pIndex)} disabled={q.matchData.pairs.length <= 1}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddMatchPair(qIndex)}><PiPlusBold/> Add pair</button></div>}
                                        {q.type === 'CATEGORIZE' && q.categorizeData && <div className="categorize-container"><h4>Categories</h4>{q.categorizeData.categories.map((cat, cIndex) => (<div key={cat.id} className="option-item"><input type="text" value={cat.name} onChange={e => handleCategoryNameChange(qIndex, cIndex, e.target.value)} className="form-control"/><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveCategory(qIndex, cIndex)} disabled={q.categorizeData.categories.length <= 1}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddCategory(qIndex)}><PiPlusBold/> Add category</button><h4 style={{marginTop: '1.5rem'}}>Items to categorize</h4>{q.categorizeData.items.map((item, iIndex) => (<div key={item.id} className="categorize-item-row"><div className="match-column">{(item.media || item.localMediaFile) ? <MediaPreview
                                            file={item.localMediaFile || item.media}
                                            cropData={item.localCropData || item.media?.cropData}
                                            onEdit={() => {
                                                const target = { qIndex, field: 'categorizeItemMedia', itemIndex: iIndex };
                                                handleEditMedia(target);
                                            }}
                                        /> : <button type="button" aria-label="Add media" className="add-media-btn-small" onClick={() => openUploadModal({ qIndex, field: 'categorizeItemMedia', itemIndex: iIndex})}><PiImagesBold/></button>}<input type="text" value={item.text} onChange={e => handleCategorizeItemChange(qIndex, iIndex, 'text', e.target.value)} placeholder="Item" className="form-control"/></div><select value={item.categoryId || ''} onChange={e => handleCategorizeItemChange(qIndex, iIndex, 'categoryId', Number(e.target.value))} className="form-control category-select"><option value="" disabled>Select category</option>{q.categorizeData.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveCategorizeItem(qIndex, iIndex)} disabled={q.categorizeData.items.length <= 1}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddCategorizeItem(qIndex)}><PiPlusBold/> Add item</button></div>}
                                        {q.type === 'REORDER' && q.reorderData && <div className="reorder-container"><h4>Items to reorder (write them in the correct order)</h4>{q.reorderData.items.map((item, iIndex) => (<div key={item.id} className="reorder-item-row"><span className="reorder-number">{iIndex+1}.</span><div className="match-column">{(item.media || item.localMediaFile) ? <MediaPreview
                                            file={item.localMediaFile || item.media}
                                            cropData={item.localCropData || item.media?.cropData}
                                            onEdit={() => {
                                                const target = { qIndex, field: 'reorderItemMedia', itemIndex: iIndex };
                                                handleEditMedia(target);
                                            }}
                                        /> : <button type="button" aria-label="Add media" className="add-media-btn-small" onClick={() => openUploadModal({ qIndex, field: 'reorderItemMedia', itemIndex: iIndex})}><PiImagesBold/></button>}<input type="text" value={item.text} onChange={e => handleReorderItemChange(qIndex, iIndex, e.target.value)} placeholder="Item text" className="form-control"/></div><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveReorderItem(qIndex, iIndex)} disabled={q.reorderData.items.length <= 1}><PiXBold/></button></div>))}<button type="button" className="add-item-btn" onClick={() => handleAddReorderItem(qIndex)}><PiPlusBold/> Add item</button></div>}
                                        {(q.type === 'VISUAL_COMPREHENSION' || q.type === 'LISTENING_COMPREHENSION') && <div className="comprehension-container"><h4 style={{marginTop: '1.5rem'}}>Follow-up questions</h4>{(q.visualData?.subQuestions || q.listeningData?.subQuestions || []).map((subQ, subQIndex) => (<div key={subQ.id} className="sub-question-card"><div className="sub-question-header"><h5>Question {subQIndex + 1}</h5><button type="button" aria-label="Remove" className="remove-item-btn" onClick={() => handleRemoveSubQuestion(qIndex, q.type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData', subQIndex)}><PiXBold/></button></div><input type="text" value={subQ.questionText} onChange={(e) => handleSubQuestionChange(qIndex, q.type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData', subQIndex, 'questionText', e.target.value)} className="form-control" placeholder="Follow-up question text"/>{subQ.type === 'MCQ' && subQ.mcqData && <div className="options-container" style={{paddingTop: '1rem'}}>{subQ.mcqData.options.map((opt, oIndex) => (<div key={opt.id} className="option-item"><input type="checkbox" className="form-check-input" checked={subQ.mcqData.correctOptions.includes(opt.id)} onChange={() => handleSubMCQCorrectToggle(qIndex, q.type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData', subQIndex, oIndex)} /><input type="text" value={opt.text} onChange={(e) => handleSubMCQOptionChange(qIndex, q.type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData', subQIndex, oIndex, e.target.value)} placeholder={`Option ${oIndex + 1}`} className="form-control" /></div>))}</div>}</div>))}<div className="sub-question-add-buttons"><button type="button" className="add-item-btn" onClick={() => handleAddSubQuestion(qIndex, q.type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData', 'MCQ')}><PiPlusBold/> Add multiple choice</button></div></div>}
                                    </div>
                                        </motion.div>
                                        )}
                                </motion.li>
                                        );
                                    })}
                                </AnimatePresence>
                            </ul>

                            {/* Adding a question: a quiet row of type buttons. */}
                            <div className="add-question-row">
                                <p className="eyebrow">{quizType === 'MIXED' ? 'Add a question' : 'Add another'}</p>
                                <div className="add-type-buttons">
                                    {addTypes.map(({ value, label, Icon }) => (
                                        <motion.button key={value} type="button" className="add-type-btn" whileTap={{ scale: 0.96 }} transition={spring} onClick={() => handleAddQuestion(value)}>
                                            <Icon aria-hidden="true" />{label}
                                        </motion.button>
                                    ))}
                                    <motion.button type="button" className="add-type-btn is-bank" whileTap={{ scale: 0.96 }} transition={spring} onClick={openBankModal}>
                                        <PiDatabaseBold aria-hidden="true" />Insert from bank
                                    </motion.button>
                                </div>
                            </div>
                        </section>
                    </>
                ) : (
                    <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="quiz-published-section">
                        <motion.p variants={rise} className="eyebrow">Published</motion.p>
                        <motion.h2 variants={rise} className="text-hero">Your quiz is live.</motion.h2>
                        <motion.p variants={rise} className="published-note">Share this code with your students.</motion.p>
                        <motion.div variants={rise} className="quiz-code">{generatedCode}</motion.div>
                        <motion.div variants={rise} className="published-actions">
                            <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedCode); toast.success('Code copied'); }}><PiClipboardTextBold /> Copy code</Button>
                            <Button type="button" onClick={() => navigate('/teacher/home')}>Back to dashboard</Button>
                        </motion.div>
                    </motion.div>
                )}
            </div>

            {isBankOpen && (
                <div className="bank-modal-overlay" onClick={() => setIsBankOpen(false)}>
                    <div className="bank-modal-content" role="dialog" aria-modal="true" aria-label="Question bank" onClick={(e) => e.stopPropagation()}>
                        <div className="bank-modal-header">
                            <h3>Question bank</h3>
                            <button type="button" className="close-modal-btn-simple" onClick={() => setIsBankOpen(false)} aria-label="Close"><PiXBold /></button>
                        </div>
                        <div className="bank-modal-filters">
                            <input
                                type="text"
                                className="form-control bank-search-input"
                                placeholder="Search questions"
                                aria-label="Search questions"
                                value={bankSearch}
                                onChange={(e) => setBankSearch(e.target.value)}
                            />
                            <select
                                value={bankFilterType}
                                onChange={(e) => setBankFilterType(e.target.value)}
                                className="bank-type-select"
                                aria-label="Filter by type"
                            >
                                <option value="ALL">All types</option>
                                {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="bank-questions-list">
                            {loadingBank ? (
                                <div className="bank-no-questions">Loading questions</div>
                            ) : bankQuestions.length === 0 ? (
                                <div className="bank-no-questions">Your question bank is empty. Save questions to reuse them.</div>
                            ) : (() => {
                                const filtered = bankQuestions.filter(bq => {
                                    const matchText = (bq.questionText || '').toLowerCase().includes(bankSearch.toLowerCase());
                                    const matchType = bankFilterType === 'ALL' || bq.type === bankFilterType;
                                    return matchText && matchType;
                                });
                                if (filtered.length === 0) {
                                    return <div className="bank-no-questions">No matching questions found.</div>;
                                }
                                return filtered.map(bq => (
                                    <div key={bq.id} className="bank-question-item">
                                        <div className="bank-q-details">
                                            <p className="bank-q-text">{bq.questionText || <span className="italic text-gray-400">Untitled question</span>}</p>
                                            <div className="bank-q-meta">
                                                <span className="bank-q-badge type-badge">{typeLabel(bq.type)}</span>
                                                <span className="bank-q-badge">{bq.points} pts</span>
                                                <span className="bank-q-badge">{bq.timeLimit}s</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="bank-insert-btn"
                                            onClick={() => handleInsertFromBank(bq)}
                                        >
                                            Insert
                                        </button>
                                    </div>
                                ));
                            })()}
                        </div>
                        <div className="bank-insert-actions">
                            <button type="button" onClick={() => setIsBankOpen(false)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreateQuiz;
