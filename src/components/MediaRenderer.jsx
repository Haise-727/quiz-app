import React from 'react';
import { PhotoView } from 'react-photo-view';
import { mediaKind } from '../utils/media';

// Note: We remove the direct CSS import from here. Styles will be handled by the page that uses this component.

/**
 * Renders one stored media object ({ url, fileId, fileType }) as an image,
 * video or audio player.
 *
 * `transform` only affects images served from ImageKit: 'thumbnail' for small
 * previews, 'question_main' for the large picture above a question.
 */
const MediaRenderer = ({ media, transform, className }) => {
  if (!media || !media.url) {
    return null;
  }

  // Decided in one place (utils/media.js) so the editor, the players and the
  // results pages cannot disagree about what a file is.
  const mediaType = mediaKind(media);

  let finalUrl = media.url;
  // Apply inline transformation ONLY to uploaded images from ImageKit
  if (mediaType === 'image' && media.url.includes('imagekit.io')) {
    let transformString = 'q-auto,f-auto'; // Always optimize quality and format
    if (transform === 'thumbnail') {
      transformString += ',w-160,h-120,c-at_max'; // Fit inside 160x120 box
    } else if (transform === 'question_main') {
      transformString += ',w-800'; // Set max-width to 800px, auto height
    }
    finalUrl = `${media.url}${media.url.includes('?') ? '&' : '?'}tr=${transformString}`;
  }


  switch (mediaType) {
    case 'image':
      return (
        // PhotoView uses the original, high-res URL for zooming
        <PhotoView src={media.url}>
          <img src={finalUrl} alt="Quiz media" className={`question-media-asset zoomable ${className || ''}`} />
        </PhotoView>
      );
    case 'video':
      // playsInline stops iOS from forcing full screen, which would cover the
      // question. preload=metadata gives us the duration without downloading it all.
      return <video controls playsInline preload="metadata" src={finalUrl} className={`question-media-asset ${className || ''}`} />;
    case 'audio':
      return <audio controls preload="metadata" src={finalUrl} className={`question-media-asset audio ${className || ''}`} />;
    default:
      return null;
  }
};

export default MediaRenderer;
