// ==UserScript==
// @name         SoundCloud Save Artwork
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Right-click SoundCloud artwork to save it
// @author       esqa
// @match        https://soundcloud.com/*
// @grant        GM_download
// @grant        GM_addElement
// ==/UserScript==

(function() {
    'use strict';

    let contextMenu = null;
    let targetImage = null;
    let imageType = 'artwork'; // 'artwork' or 'avatar'

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

        const menuItem = document.createElement('div');
        menuItem.textContent = 'Save Image';
        menuItem.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            color: #333;
        `;
        menuItem.onmouseover = () => menuItem.style.backgroundColor = '#f0f0f0';
        menuItem.onmouseout = () => menuItem.style.backgroundColor = 'transparent';
        menuItem.onclick = saveArtwork;

        menu.appendChild(menuItem);
        document.body.appendChild(menu);
        return menu;
    }

    // Extract high-res artwork URL
    function getHighResUrl(url) {
        // SoundCloud artwork URLs typically have size parameters like -t500x500
        // We want to get the highest quality version
        return url.replace(/-t\d+x\d+/, '-t500x500');
    }

    // Save the artwork
    function saveArtwork() {
        if (!targetImage) return;

        const imageUrl = getHighResUrl(targetImage);
        
        // Extract filename from URL or use default
        let filename = 'soundcloud-image.jpg';
        
        if (imageType === 'avatar') {
            // For avatars, try to get the username
            const username = document.querySelector('.profileHeaderInfo__userName')?.textContent ||
                           document.querySelector('.userBadge__username')?.textContent ||
                           targetImage.match(/avatars-[^/]+-(\w+)-/)?.[1] ||
                           'avatar';
            filename = username.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '-avatar.jpg';
        } else {
            // For artwork, use track title
            const trackTitle = document.querySelector('.playbackSoundBadge__title span[aria-hidden="true"]')?.textContent ||
                              document.querySelector('.soundTitle__title span')?.textContent;
            
            if (trackTitle) {
                filename = trackTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
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

    // Hide context menu
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
        targetImage = null;
        imageType = 'artwork';
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
        if (element.tagName === 'IMG') {
            return element.src;
        }
        
        if (element.style.backgroundImage) {
            const match = element.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
            return match ? match[1] : null;
        }
        
        // Check for img child elements
        const img = element.querySelector('img');
        if (img) return img.src;
        
        // Check parent elements
        const parent = element.closest('.sc-artwork, .sound__coverArt, .playbackSoundBadge__avatar');
        if (parent) {
            const bgImage = window.getComputedStyle(parent).backgroundImage;
            const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
            return match ? match[1] : null;
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