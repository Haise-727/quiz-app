import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageKit from 'imagekit-javascript';

// Initialize the ImageKit SDK once with your public keys.
const imagekit = new ImageKit({
  publicKey: import.meta.env.VITE_PUBLIC_KEY,
  urlEndpoint: import.meta.env.VITE_URL_ENDPOINT,
});

// =================================================================
// SOLUTION: A dedicated component for rendering the media preview.
// This component can safely use the useEffect Hook for cleanup.
// =================================================================
const MediaPreview = ({ file }) => {
  const [fileType, setFileType] = useState('unknown');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    // This effect runs whenever the `file` prop changes.
    if (!file) {
      setPreviewUrl('');
      return;
    }

    // Determine the file type
    const source = file.name || file.url || '';
    if (/\.(jpe?g|png|gif|webp|svg)$/i.test(source)) setFileType('image');
    else if (/\.(mp4|webm|mov|ogg)$/i.test(source)) setFileType('video');
    else if (/\.(mp3|wav|aac|flac)$/i.test(source)) setFileType('audio');
    else if (file.type?.startsWith('image/')) setFileType('image');
    else if (file.type?.startsWith('video/')) setFileType('video');
    else if (file.type?.startsWith('audio/')) setFileType('audio');
    else setFileType('unknown');

    // Generate a temporary URL for local files; use existing URL for uploaded files.
    const url = file.url || URL.createObjectURL(file);
    setPreviewUrl(url);

    // This is the cleanup function. It runs when the component unmounts or the file changes.
    return () => {
      // If the URL was a temporary local one, revoke it to prevent memory leaks.
      if (file && !file.url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [file]); // Dependency array ensures this effect re-runs only when the file changes.

  if (!file || !previewUrl) return null;

  switch (fileType) {
    case 'image':
      return <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }} />;
    case 'video':
      return <video controls src={previewUrl} style={{ maxWidth: '100%', maxHeight: '300px' }} />;
    case 'audio':
      return <audio controls src={previewUrl} style={{ width: '100%' }} />;
    default:
      return <p style={{ color: '#888' }}>File type not supported for preview</p>;
  }
};


// =================================================================
// Main MediaTest Component
// =================================================================
const MediaTest = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Helper to determine the backend API URL.
  const getApiUrl = () => {
    return import.meta.env.VITE_API_URL || '';
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      setUploadedFile(null);
      // Reset the input so the same file can be selected again after an action.
      event.target.value = null; 
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // Step 1: Fetch temporary authentication parameters from our secure backend.
      const authApiUrl = `${getApiUrl()}/api/auth`;
      const response = await fetch(authApiUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Authentication server failed with status: ${response.status}`);
      }
      
      const authParams = await response.json();
      
      if (!authParams.signature || !authParams.expire || !authParams.token) {
        throw new Error('Invalid authentication parameters received from the server.');
      }

      // Step 2: Use the fetched parameters to perform the upload.
      const fileName = `test_${Date.now()}_${selectedFile.name}`;
      
      const result = await imagekit.upload({
        file: selectedFile,
        fileName: fileName,
        folder: '/quiz-app-media-test',
        signature: authParams.signature,
        expire: authParams.expire,
        token: authParams.token,
        onUploadProgress: (progress) => {
          const percentComplete = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percentComplete);
        }
      });
      
      setUploadedFile(result);
      console.log('Upload successful:', result);
      
    } catch (err) {
      console.error('Upload error object:', err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    alert("Client-side deletion is disabled for security. This feature requires a dedicated, secure backend endpoint.");
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      color: '#333'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0 }}>Secure ImageKit Media Test</h1>
        <button onClick={() => navigate('/teacher/home')} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ backgroundColor: '#e7f3ff', color: '#0c5460', padding: '12px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #bee5eb', fontSize: '14px' }}>
        <strong>🔗 API Endpoint Base:</strong> {getApiUrl() || '(Relative Path)'}
      </div>

      <div style={{ border: '2px dashed #ddd', borderRadius: '8px', padding: '20px', textAlign: 'center', marginBottom: '20px', backgroundColor: '#fafafa' }}>
        <h3>Upload Media File</h3>
        <input type="file" accept="image/*,video/*,audio/*" onChange={handleFileSelect} style={{ marginBottom: '15px' }} />
        
        {selectedFile && !uploadedFile && (
            <div style={{ marginBottom: '15px' }}>
              <p><strong>Selected:</strong> {selectedFile.name}</p>
              <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px', backgroundColor: '#fff' }}>
                <h4>Local Preview:</h4>
                <MediaPreview file={selectedFile} />
              </div>
            </div>
        )}

        <button onClick={handleUpload} disabled={!selectedFile || isUploading} style={{ padding: '10px 20px', backgroundColor: isUploading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: isUploading ? 'not-allowed' : 'pointer', fontSize: '16px' }}>
          {isUploading ? `Uploading...` : 'Secure Upload to ImageKit'}
        </button>

        {isUploading && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: '8px', backgroundColor: '#007bff', transition: 'width 0.3s ease' }} />
            </div>
            <p style={{ margin: '5px 0' }}>{uploadProgress}%</p>
          </div>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '12px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #f5c6cb' }}>
          {error}
        </div>
      )}

      {uploadedFile && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '20px', borderRadius: '8px', border: '1px solid #c3e6cb', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Secure Upload Successful!</h3>
            <button onClick={handleDelete} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Delete File
            </button>
          </div>

          <div style={{ marginBottom: '15px', fontSize: '14px', wordBreak: 'break-all' }}>
            <p><strong>File ID:</strong> {uploadedFile.fileId}</p>
            <p><strong>File Name:</strong> {uploadedFile.name}</p>
            <p><strong>URL:</strong> <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 'bold' }}>{uploadedFile.url}</a></p>
            <p><strong>Size:</strong> {uploadedFile.size ? (uploadedFile.size / 1024).toFixed(2) + ' KB' : 'N/A'}</p>
          </div>

          <div style={{ border: '1px solid #c3e6cb', borderRadius: '4px', padding: '15px', backgroundColor: '#ffffff', textAlign: 'center' }}>
            <h4 style={{ marginTop: 0, marginBottom: '15px' }}>Preview from ImageKit:</h4>
            <MediaPreview file={uploadedFile} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaTest;