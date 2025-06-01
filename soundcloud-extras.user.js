// ==UserScript==
// @name         SoundCloud Extras
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Right-click to save artwork or download tracks from SoundCloud
// @author       esqa
// @match        https://soundcloud.com/*
// @grant        GM_download
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    let contextMenu = null;
    let targetImage = null;
    let imageType = 'artwork'; // 'artwork' or 'avatar'
    let targetElement = null; // Store the element that was clicked

    // Create custom context menu
    function createContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'sc-save-artwork-menu';
        menu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 4px 0;
            box-shadow: 2px 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            display: none;
        `;

        document.body.appendChild(menu);
        return menu;
    }

    // Create menu item
    function createMenuItem(text, onClick) {
        const menuItem = document.createElement('div');
        menuItem.textContent = text;
        menuItem.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            color: #333;
        `;
        menuItem.onmouseover = () => menuItem.style.backgroundColor = '#f0f0f0';
        menuItem.onmouseout = () => menuItem.style.backgroundColor = 'transparent';
        menuItem.onclick = onClick;
        return menuItem;
    }

    // Extract high-res artwork URL
    function getHighResUrl(url) {
        // SoundCloud artwork URLs typically have size parameters like -t500x500
        // We want to get the highest quality version
        return url.replace(/-t\d+x\d+/, '-t500x500');
    }
    
    // Clean filename - remove multiple underscores and trim
    function cleanFilename(str) {
        return str.replace(/[^a-z0-9]/gi, '_')  // Replace non-alphanumeric with underscore
                  .replace(/_+/g, '_')           // Replace multiple underscores with single
                  .replace(/^_|_$/g, '')         // Remove leading/trailing underscores
                  .toLowerCase();
    }

    // Get track info from current context
    function getTrackInfo() {
        let trackTitle = null;
        let artistName = null;
        
        // First, try to get title from aria-label attribute
        if (targetElement?.getAttribute('aria-label')) {
            trackTitle = targetElement.getAttribute('aria-label').trim();
        }
        
        // Check if clicking on the playback bar
        const isPlaybackBar = targetElement?.closest('.playbackSoundBadge, .playControls');
        
        if (!trackTitle && isPlaybackBar) {
            // For playback bar, always use the currently playing track
            trackTitle = document.querySelector('.playbackSoundBadge__title span[aria-hidden="true"]')?.textContent?.trim() ||
                       document.querySelector('.playbackSoundBadge__titleLink')?.textContent?.trim();
            artistName = document.querySelector('.playbackSoundBadge__lightLink')?.textContent?.trim();
        } else if (!trackTitle && window.location.pathname.includes('/') && window.location.pathname.split('/').length === 3) {
            // On a track page and NOT clicking playback bar, use the main title
            trackTitle = document.querySelector('.soundTitle__title')?.textContent?.trim() ||
                       document.querySelector('h1[itemprop="name"]')?.textContent?.trim() ||
                       document.querySelector('.fullHero__title')?.textContent?.trim();
            artistName = document.querySelector('.soundTitle__username')?.textContent?.trim() ||
                        document.querySelector('.soundTitle__usernameText')?.textContent?.trim();
        }
        
        // If not on track page or title not found, look in clicked element's context
        if (!trackTitle) {
            const soundItem = targetElement?.closest('.sound__body, .soundList__item, .trackItem, .searchItem, .soundBadge, .userStreamItem, .playableTile, .soundStreamContent');
            if (soundItem) {
                // First check for aria-label in the artwork element
                const artwork = soundItem.querySelector('.sc-artwork[aria-label], .playableTile__artwork[aria-label]');
                if (artwork) {
                    trackTitle = artwork.getAttribute('aria-label').trim();
                } else {
                    // Fallback to text-based selectors - expanded list
                    trackTitle = soundItem.querySelector('.soundTitle__title span:not(.soundTitle__usernameText)')?.textContent?.trim() ||
                               soundItem.querySelector('.soundTitle__title')?.textContent?.trim() ||
                               soundItem.querySelector('.trackItem__trackTitle')?.textContent?.trim() ||
                               soundItem.querySelector('.soundTitle__titleContainer a')?.textContent?.trim() ||
                               soundItem.querySelector('a.soundTitle__title')?.textContent?.trim() ||
                               soundItem.querySelector('.playableTile__mainHeading')?.textContent?.trim() ||
                               soundItem.querySelector('.playableTile__heading a')?.textContent?.trim() ||
                               soundItem.querySelector('a[href*="/"][href*="-"]:not(.soundTitle__username):not(.playableTile__usernameLink)')?.textContent?.trim();
                }
                artistName = soundItem.querySelector('.soundTitle__username')?.textContent?.trim() ||
                           soundItem.querySelector('.soundTitle__usernameText')?.textContent?.trim() ||
                           soundItem.querySelector('.playableTile__username')?.textContent?.trim() ||
                           soundItem.querySelector('.playableTile__usernameLink')?.textContent?.trim();
            }
        }
        
        // Fallback to currently playing track if no title found
        if (!trackTitle) {
            trackTitle = document.querySelector('.playbackSoundBadge__title span[aria-hidden="true"]')?.textContent ||
                        document.querySelector('.soundTitle__title span')?.textContent;
            artistName = document.querySelector('.playbackSoundBadge__lightLink')?.textContent?.trim();
        }
        
        return { trackTitle, artistName };
    }

    // Save the artwork
    function saveArtwork() {
        if (!targetImage) return;

        const imageUrl = getHighResUrl(targetImage);
        
        // Extract filename from URL or use default
        let filename = 'soundcloud-image.jpg';
        
        if (imageType === 'avatar') {
            // For avatars, try to get the username
            let username = document.querySelector('.profileHeaderInfo__userName')?.textContent?.trim() ||
                          document.querySelector('.userBadge__username')?.textContent?.trim() ||
                          targetImage.match(/avatars-[^/]+-(\w+)-/)?.[1] ||
                          'avatar';
            // Clean up username - remove extra whitespace and special characters
            username = username.replace(/\s+/g, ' ').trim();
            filename = cleanFilename(username) + '-avatar.jpg';
        } else {
            // For artwork, get track title
            const { trackTitle } = getTrackInfo();
            
            if (trackTitle) {
                filename = cleanFilename(trackTitle) + '.jpg';
            }
        }

        // Use GM_download for cross-origin images
        GM_download({
            url: imageUrl,
            name: filename,
            onerror: function(error) {
                console.error('Download failed:', error);
                alert('Failed to download artwork. Please try again.');
            }
        });

        hideContextMenu();
    }

    // Get SoundCloud client ID from page
    async function getClientId() {
        try {
            // Method 1: Check window.__sc_hydration
            if (window.__sc_hydration) {
                for (let item of window.__sc_hydration) {
                    if (item && item.hydratable === 'anonymousId' && item.data) {
                        console.log('Found client ID in __sc_hydration');
                        return item.data;
                    }
                }
            }
            
            // Method 2: Extract from scripts in page
            const scripts = document.querySelectorAll('script');
            for (let script of scripts) {
                if (script.textContent && script.textContent.includes('client_id')) {
                    const match = script.textContent.match(/["']client_id["']\s*:\s*["']([a-zA-Z0-9]+)["']/);
                    if (match) {
                        console.log('Found client ID in inline script');
                        return match[1];
                    }
                }
            }
            
            // Method 3: Try to intercept from network requests
            // This is a more aggressive approach - get it from the main JS files
            const mainScript = Array.from(scripts).find(s => s.src && s.src.includes('49-'));
            if (mainScript) {
                return new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: mainScript.src,
                        onload: function(response) {
                            const match = response.responseText.match(/client_id:"([a-zA-Z0-9]+)"/);
                            if (match) {
                                console.log('Found client ID in main script');
                                resolve(match[1]);
                            } else {
                                // Fallback
                                resolve('iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX');
                            }
                        },
                        onerror: function() {
                            resolve('iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX');
                        }
                    });
                });
            }
            
            // Fallback: use a known working client ID
            console.log('Using fallback client ID');
            return 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';
        } catch (error) {
            console.error('Error getting client ID:', error);
            return 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';
        }
    }

    // Get track ID from URL
    function getTrackId(trackUrl) {
        // Extract track info from URL (format: /username/track-name)
        const urlParts = trackUrl.replace('https://soundcloud.com/', '').split('/');
        if (urlParts.length >= 2) {
            return { username: urlParts[0], permalink: urlParts[1] };
        }
        return null;
    }

    // Download the song
    async function downloadSong() {
        const { trackTitle, artistName } = getTrackInfo();
        
        if (!trackTitle) {
            alert('Could not find track information. Please try again.');
            hideContextMenu();
            return;
        }
        
        // Get the track URL
        let trackUrl = null;
        
        // First try to get from the clicked element's context
        const soundItem = targetElement?.closest('.sound__body, .soundList__item, .trackItem, .searchItem, .soundBadge, .userStreamItem, .playableTile, .soundStreamContent');
        if (soundItem) {
            // Look for various types of track links
            const trackLink = soundItem.querySelector('a.soundTitle__title, a.playableTile__mainHeading, a.soundTitle__titleLink, a[href*="/"][href*="-"]:not(.soundTitle__username):not(.soundTitle__usernameLink)') ||
                            soundItem.querySelector('.trackItem__trackTitle a') ||
                            soundItem.querySelector('.soundTitle__titleContainer a');
            if (trackLink && trackLink.href) {
                trackUrl = trackLink.href;
            }
        }
        
        // Check if clicking on the playback bar
        if (!trackUrl && targetElement?.closest('.playbackSoundBadge, .playControls')) {
            const playbackLink = document.querySelector('.playbackSoundBadge__titleLink');
            if (playbackLink && playbackLink.href) {
                trackUrl = playbackLink.href;
            }
        }
        
        // If still no URL and we're on a track page, use current URL
        if (!trackUrl && window.location.pathname.includes('/') && window.location.pathname.split('/').length === 3) {
            trackUrl = window.location.href;
        }
        
        if (!trackUrl) {
            alert('Could not find track URL. Please try clicking on the track artwork.');
            hideContextMenu();
            return;
        }
        
        hideContextMenu();
        
        try {
            // Show loading message
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #333;
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                z-index: 10000;
                font-size: 14px;
            `;
            loadingDiv.textContent = 'Fetching track data...';
            document.body.appendChild(loadingDiv);
            
            // Get client ID
            const clientId = await getClientId();
            
            // Get track info from URL
            const trackInfo = getTrackId(trackUrl);
            if (!trackInfo) {
                throw new Error('Invalid track URL');
            }
            
            // Resolve track to get track data
            const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(trackUrl)}&client_id=${clientId}`;
            
            GM_xmlhttpRequest({
                method: 'GET',
                url: resolveUrl,
                headers: {
                    'Accept': 'application/json',
                    'Origin': 'https://soundcloud.com',
                    'Referer': 'https://soundcloud.com/'
                },
                onload: async function(response) {
                    try {
                        console.log('API Response:', response.responseText);
                        console.log('Using client ID:', clientId);
                        
                        // Check if we got an error response
                        if (response.status === 401 || response.status === 403) {
                            throw new Error('Authorization failed - client ID may be invalid');
                        }
                        
                        const trackData = JSON.parse(response.responseText);
                        
                        if (!trackData) {
                            throw new Error('Track data not found');
                        }
                        
                        // Log track data structure
                        console.log('Track data keys:', Object.keys(trackData));
                        
                        // Check different possible structures
                        const media = trackData.media || trackData.track?.media;
                        const streamable = trackData.streamable !== undefined ? trackData.streamable : 
                                         trackData.track?.streamable !== undefined ? trackData.track.streamable : true;
                        
                        // Check if track is downloadable
                        if (!streamable) {
                            loadingDiv.remove();
                            alert('This track is not streamable.');
                            return;
                        }
                        
                        loadingDiv.textContent = 'Fetching stream URL...';
                        
                        // Get stream URL
                        let streamUrl = null;
                        
                        if (media && media.transcodings) {
                            // Find progressive stream (direct MP3 URL)
                            const progressive = media.transcodings.find(t => 
                                t.format.protocol === 'progressive' && 
                                t.format.mime_type === 'audio/mpeg'
                            );
                            
                            if (progressive && progressive.url) {
                                // Get actual stream URL
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: `${progressive.url}?client_id=${clientId}`,
                                    onload: function(streamResponse) {
                                        try {
                                            const streamData = JSON.parse(streamResponse.responseText);
                                            if (streamData.url) {
                                                loadingDiv.textContent = 'Downloading...';
                                                
                                                // Generate filename
                                                const filename = cleanFilename(artistName ? `${artistName} - ${trackTitle}` : trackTitle) + '.mp3';
                                                
                                                // Download the file
                                                GM_download({
                                                    url: streamData.url,
                                                    name: filename,
                                                    onload: function() {
                                                        loadingDiv.textContent = 'Download complete!';
                                                        setTimeout(() => loadingDiv.remove(), 2000);
                                                    },
                                                    onerror: function(error) {
                                                        console.error('Download failed:', error);
                                                        loadingDiv.remove();
                                                        alert('Failed to download track. The track might be restricted.');
                                                    }
                                                });
                                            } else {
                                                throw new Error('Stream URL not found');
                                            }
                                        } catch (error) {
                                            console.error('Error parsing stream data:', error);
                                            loadingDiv.remove();
                                            alert('Failed to get stream URL.');
                                        }
                                    },
                                    onerror: function(error) {
                                        console.error('Error fetching stream URL:', error);
                                        loadingDiv.remove();
                                        alert('Failed to fetch stream URL.');
                                    }
                                });
                            } else {
                                // Try HLS stream as fallback
                                const hls = media.transcodings.find(t => 
                                    t.format.protocol === 'hls' && 
                                    t.format.mime_type === 'audio/mpeg'
                                );
                                
                                if (hls) {
                                    loadingDiv.remove();
                                    alert('This track uses HLS streaming. Direct download is not supported for HLS streams.');
                                } else {
                                    throw new Error('No suitable stream format found');
                                }
                            }
                        } else {
                            throw new Error('No media transcodings found');
                        }
                    } catch (error) {
                        console.error('Error processing track data:', error);
                        loadingDiv.remove();
                        alert('Failed to process track data. The track might be restricted or private.');
                    }
                },
                onerror: function(error) {
                    console.error('Error fetching track data:', error);
                    loadingDiv.remove();
                    alert('Failed to fetch track data. Please try again.');
                }
            });
            
        } catch (error) {
            console.error('Download error:', error);
            alert('An error occurred while downloading. Please try again.');
        }
    }

    // Hide context menu
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
        targetImage = null;
        imageType = 'artwork';
        targetElement = null;
    }

    // Check if element is SoundCloud image (artwork or avatar)
    function isSoundCloudImage(element) {
        if (!element) return false;
        
        // Check if it's an image element
        if (element.tagName === 'IMG') {
            return element.src.includes('sndcdn.com');
        }
        
        // Check if it's a div with background image
        if (element.style.backgroundImage) {
            return element.style.backgroundImage.includes('sndcdn.com');
        }
        
        // Check parent elements for artwork or avatar containers
        const imageSelectors = [
            '.image__full',
            '.image__lightOutline',
            '.sc-artwork',
            '.sound__coverArt',
            '.playbackSoundBadge__avatar',
            '.soundBadge__avatarArtwork',
            '.userBadge__avatar',
            '.profileHeaderInfo__avatar',
            '.artistAvatar',
            '.userAvatar'
        ];
        
        return imageSelectors.some(selector => element.closest(selector));
    }
    
    // Determine if image is avatar or artwork
    function getImageType(element) {
        const avatarSelectors = [
            '.userBadge__avatar',
            '.profileHeaderInfo__avatar',
            '.artistAvatar',
            '.userAvatar'
        ];
        
        // Check if it's an avatar
        if (avatarSelectors.some(selector => element.closest(selector))) {
            return 'avatar';
        }
        
        // Check URL patterns for avatars
        const imgUrl = getImageUrl(element);
        if (imgUrl && imgUrl.includes('avatars-')) {
            return 'avatar';
        }
        
        return 'artwork';
    }

    // Get image URL from element
    function getImageUrl(element) {
        // Store the element for later reference
        targetElement = element;
        
        if (element.tagName === 'IMG') {
            return element.src;
        }
        
        if (element.style.backgroundImage) {
            const match = element.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
            return match ? match[1] : null;
        }
        
        // Check for img child elements
        const img = element.querySelector('img');
        if (img) {
            targetElement = img;
            return img.src;
        }
        
        // Check parent elements
        const parent = element.closest('.sc-artwork, .sound__coverArt, .playbackSoundBadge__avatar');
        if (parent) {
            const bgImage = window.getComputedStyle(parent).backgroundImage;
            const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
            if (match) {
                targetElement = parent;
                return match[1];
            }
        }
        
        return null;
    }

    // Initialize
    contextMenu = createContextMenu();

    // Handle right-click
    document.addEventListener('contextmenu', function(e) {
        if (isSoundCloudImage(e.target)) {
            e.preventDefault();
            
            const imageUrl = getImageUrl(e.target);
            if (imageUrl) {
                targetImage = imageUrl;
                imageType = getImageType(e.target);
                
                // Clear existing menu items
                contextMenu.innerHTML = '';
                
                // Add Save Image option
                const saveImageItem = createMenuItem('Save Image', saveArtwork);
                contextMenu.appendChild(saveImageItem);
                
                // Add Download Song option if it's artwork (not avatar)
                if (imageType === 'artwork') {
                    const downloadSongItem = createMenuItem('Save Track', downloadSong);
                    contextMenu.appendChild(downloadSongItem);
                }
                
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                contextMenu.style.display = 'block';
            }
        } else {
            hideContextMenu();
        }
    });

    // Hide menu on click elsewhere
    document.addEventListener('click', function(e) {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    // Hide menu on scroll
    window.addEventListener('scroll', hideContextMenu);
})();