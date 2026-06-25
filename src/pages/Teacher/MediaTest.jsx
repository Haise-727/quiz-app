import React, { useState, useEffect } from 'react';
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
    <div className="w-full max-w-3xl mx-auto relative">
      {/* Hero / Page Title */}
      <div className="pb-6">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-black text-[hsl(var(--foreground))]">Media Upload Test</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Test and verify secure uploads to ImageKit storage.</p>
        </motion.div>
      </div>

      <div className="bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] p-3.5 rounded-[10px] mb-6 text-xs font-semibold">
        <strong>🔗 API Endpoint Base:</strong> {getApiUrl() || '(Relative Path)'}
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6 flex flex-col items-center text-center">
          <h3 className="font-bold text-base text-[hsl(var(--foreground))] mb-4">Upload Media File</h3>
          
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={handleFileSelect}
            className="mb-4 block w-full text-xs text-[hsl(var(--muted-foreground))]
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-xs file:font-semibold
              file:bg-[hsl(var(--muted))] file:text-[hsl(var(--foreground))]
              hover:file:bg-[hsl(var(--surface-container-high))]
              cursor-pointer"
          />
          
          {selectedFile && !uploadedFile && (
            <Card className="w-full mb-4 bg-[hsl(var(--surface-container-low))] border-[hsl(var(--border))]">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2"><strong>Selected File:</strong> {selectedFile.name}</p>
                <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))] p-3 bg-[hsl(var(--surface))]">
                  <p className="text-xs font-semibold mb-2">Local Preview:</p>
                  <MediaPreview file={selectedFile} />
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="w-full sm:w-auto"
          >
            {isUploading ? `Uploading...` : 'Secure Upload to ImageKit'}
          </Button>

          {isUploading && (
            <div className="w-full mt-4">
              <div className="w-full bg-[hsl(var(--border))] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[hsl(var(--primary))] h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{uploadProgress}% uploaded</p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-[10px] mb-6 text-sm">
          {error}
        </div>
      )}

      {uploadedFile && (
        <Card className="border-green-500/20 bg-green-500/5 mb-6">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm text-[hsl(var(--foreground))]">Secure Upload Successful!</h3>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete File
              </Button>
            </div>

            <div className="mb-4 text-xs space-y-1.5 text-[hsl(var(--muted-foreground))] font-mono break-all text-left">
              <p><strong>File ID:</strong> {uploadedFile.fileId}</p>
              <p><strong>File Name:</strong> {uploadedFile.name}</p>
              <p><strong>URL:</strong> <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] underline">{uploadedFile.url}</a></p>
              <p><strong>Size:</strong> {uploadedFile.size ? (uploadedFile.size / 1024).toFixed(2) + ' KB' : 'N/A'}</p>
            </div>

            <Card className="bg-[hsl(var(--surface))] border-[hsl(var(--border))]">
              <CardContent className="pt-4 pb-4 text-center">
                <h4 className="text-xs font-semibold mb-3">Preview from ImageKit:</h4>
                <MediaPreview file={uploadedFile} />
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MediaTest;