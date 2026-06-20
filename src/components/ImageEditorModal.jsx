import React, { useRef, useEffect, useState } from 'react';
import ImageEditor from '@toast-ui/react-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';
import { FaSave, FaTimes, FaTrashAlt } from 'react-icons/fa';

// Define the custom theme for the editor to match your app's aesthetic
const myTheme = {
  // Theme object for TOAST UI Image Editor
  // You can customize colors, fonts, etc. to match your app's theme
  // This is a basic example, you'll want to adjust these to fit your CreateQuiz.css
  'common.bi.image': '', // Remove the default TOAST UI logo
  'common.bisize.width': '0px',
  'common.bisize.height': '0px',
  'common.backgroundImage': 'none',
  'common.backgroundColor': '#2d3748', // Dark background for the editor area
  'common.border': '1px solid #4a5568',

  // Header
  'header.backgroundImage': 'none',
  'header.backgroundColor': '#1a202c',
  'header.borderBottom': '1px solid #4a5568',

  // Load button (Set to transparent/hidden via theme)
  'loadButton.backgroundColor': 'transparent',
  'loadButton.border': '0px',
  'loadButton.color': 'transparent',
  'loadButton.fontFamily': 'Inter',
  'loadButton.fontSize': '0px', // Hide text

  // Download button (Set to transparent/hidden via theme)
  'downloadButton.backgroundColor': 'transparent',
  'downloadButton.border': '0px',
  'downloadButton.color': 'transparent',
  'downloadButton.fontFamily': 'Inter',
  'downloadButton.fontSize': '0px', // Hide text

  // Main icons
  'menu.normalIcon.color': '#a0aec0',
  'menu.activeIcon.color': '#f5af19',
  'menu.disabledIcon.color': '#718096',
  'menu.hoverIcon.color': '#f5af19',
  'submenu.normalIcon.color': '#a0aec0',
  'submenu.activeIcon.color': '#f5af19',

  'menu.activeBgColor': 'rgba(245, 175, 25, 0.2)',
  'submenu.activeBgColor': 'rgba(245, 175, 25, 0.2)',

  // Submenu primary buttons
  'submenu.backgroundColor': '#2d3748',
  'submenu.partition.color': '#4a5568',
  'submenu.normalLabel.color': '#a0aec0',
  'submenu.activeLabel.color': '#f5af19',
  'submenu.range.pointer.color': '#f5af19',
  'submenu.range.bar.color': '#4a5568',
  'submenu.range.value.color': '#a0aec0',
  'submenu.range.value.fontWeight': 'lighter',
  'submenu.checkbox.color': '#a0aec0',
  'submenu.checkbox.border': '1px solid #4a5568',
  'submenu.checkbox.backgroundColor': '#1a202c',
  'submenu.activeMenuIcon.color': '#f5af19',

  // Colorpicker
  'colorpicker.button.border': '1px solid #4a5568',
  'colorpicker.title.color': '#a0aec0',
};


const ImageEditorModal = ({ imageSrc, onEditComplete, onClose, onDelete }) => {
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(true); // Control the overlay
  const [error, setError] = useState('');

  useEffect(() => {
    console.log("ImageEditorModal useEffect triggered. imageSrc:", imageSrc ? imageSrc.substring(0, 50) + "..." : "null");
    if (imageSrc) {
      setLoading(true);
      setError('');
      const timer = setTimeout(() => {
        if (editorRef.current) {
          console.log("ImageEditor instance likely ready.");
          setLoading(false);
        } else {
          console.warn("ImageEditor ref not available after delay. Editor might not render correctly.");
          setError("Editor failed to initialize. Please try again.");
          setLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      console.log("No imageSrc provided to ImageEditorModal.");
      setError("No image provided for editing.");
      setLoading(false);
    }
  }, [imageSrc]);

  const handleSave = () => {
    if (editorRef.current) {
      const imageEditor = editorRef.current.getInstance();
      const dataURL = imageEditor.toDataURL();

      fetch(dataURL)
        .then(res => res.blob())
        .then(blob => {
          const editedFile = new File([blob], `edited_image_${Date.now()}.png`, { type: 'image/png' });
          onEditComplete(editedFile);
        })
        .catch(err => {
          console.error("Error converting edited image to Blob:", err);
          setError("Failed to save edited image.");
        });
    }
  };

  return (
    <div className="cropper-modal-overlay">
      <div className="cropper-modal-content image-editor-modal-content">
        <div className="image-editor-header">
          <h3>Image Editor</h3>
          <button className="close-modal-btn-simple" onClick={onClose}><FaTimes /></button>
        </div>
        {loading && <div className="editor-loading">Loading image editor...</div>}
        {error && <div className="editor-error">{error}</div>}
        <ImageEditor
            ref={editorRef}
            includeUI={{
              loadImage: {
                path: imageSrc,
                name: 'image',
              },
              theme: myTheme,
              menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'filter'],
              initMenu: 'draw',
              uiSize: {
                width: '100%',
                height: 'calc(100% - 120px)',
              },
              menuBarPosition: 'bottom',
            }}
            cssMaxHeight={500}
            cssMaxWidth={700}
            selectionStyle={{
              cornerSize: 20,
              rotatingPointOffset: 70,
            }}
            usageStatistics={false}
          />

        <div className="cropper-actions image-editor-actions">
          <button className="cropper-btn-delete" onClick={onDelete}><FaTrashAlt /> Delete Media</button>
          <div className="cropper-actions-right">
            <button className="cropper-btn-cancel" onClick={onClose}><FaTimes /> Cancel</button>
            <button className="cropper-btn-confirm" onClick={handleSave}><FaSave /> Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageEditorModal;