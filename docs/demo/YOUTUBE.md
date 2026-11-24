# YouTube upload kit — Social Links demo

**Video:** `social-links-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, 1:35)
**Thumbnail:** `social-links-thumbnail.png` (1280×720)
**Captions:** `social-links-demo.en.srt` (English)

## Title (pick one, under 70 characters)
1. Social Links: paste your LinkedIn & GitHub into any form with one right-click
2. Stop retyping your LinkedIn URL: a free right-click browser extension
3. Social Links extension demo: open, copy & add profile links anywhere

## Description
```
Tired of typing your LinkedIn, GitHub and portfolio URLs into every job application and hackathon form? Social Links puts all your profile links in your browser's right-click menu.

▶ Get it (free, open source): https://github.com/mukeshkbj/SocialLinks

What it does
• Right-click in a text box › Social links › Paste here: the link is typed in for you
• Or Copy / Open any saved link from the right-click menu
• Type sl and a name in the address bar to open or copy a link without the mouse
• Right-click a profile link › + Add this link (platform and username detected)
• + means not added yet, ✎ means saved: click to edit
• Add any other site: 35 suggestions (Kaggle, Hugging Face, Devpost, Behance…) so you only type your username
• Work and Personal profiles
• ★ main links: choose which links go on your share card (QR code + vCard)
• Back up and restore with a preview

Private by design: it never reads the websites you visit, and only types into a page when you choose Paste. No tracking, no analytics, no network requests. Your links sync through your own browser account.

Works in Chrome, Edge, Brave, Opera and Firefox. Install steps are in the README.

Chapters
0:00 What Social Links does
0:10 Paste, copy and open links from the right-click menu
0:26 Address-bar shortcut and saving links
0:43 Toolbar panel and site suggestions
0:59 Main links, share card, profiles and backup
1:22 Privacy and where to get it

The people and sites shown (Alex Morgan, Northwind Robotics, morgan.dev) are fictional demo data.

#browserextension #productivity #jobsearch
```

## Tags
social links, browser extension, chrome extension, edge extension, firefox add-on, right click menu, linkedin url, github profile, copy linkedin link, job application, hackathon, productivity tool, open source, vcard, qr code

## Upload settings
- **Category:** Science & Technology
- **Audience:** No, it's not made for kids
- **Language:** English. Upload the `.srt` under **Subtitles**. The captions are already burnt into the video, so this file is for accessibility, search and auto-translation; viewers who turn on CC will see both.
- **Thumbnail:** upload `social-links-thumbnail.png`. Custom thumbnails need a verified YouTube account (phone verification).
- **Chapters:** they appear automatically from the timestamps in the description, which must start at 0:00.
- **Altered or synthetic content:** No. This is a screen-style product demo; the extension screens are real captures and the browser and pages are illustrations.
- **End screen (optional):** add a "Subscribe" element and a link to the GitHub repo in the last 5–20 seconds (the video's end card is 6.5 seconds, from 1:28).
- **Visibility:** start as **Unlisted** to check it, then switch to **Public**.

## Optional voiceover
The video has music and on-screen captions but no narration. To add your own voice, record the script below (about 190 words, 90 seconds at a relaxed pace). Then in YouTube Studio › Editor › Audio, lower the music, or replace the track before uploading:

```
ffmpeg -i social-links-demo.mp4 -i voice.wav -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k social-links-demo-voice.mp4
```

### Narration script (lines start at these times)
- **0:00** This is Social Links, your profile links one right-click away.
- **0:05** Every application asks for the same links.
- **0:09** Right-click in the box, Social links, LinkedIn, Paste here. Done.
- **0:16** Same for GitHub, or any link you've saved.
- **0:21** You can open them in a new tab too.
- **0:26** No mouse? Type "sl", a space and a name in the address bar.
- **0:31** "sl c github" copies it instead.
- **0:36** To save a link, right-click it and choose "Add this link". It works out the platform and username for you.
- **0:44** Everything lives behind the toolbar button. Plus means not added yet; the pencil means saved.
- **0:51** For other sites, it suggests 35 as you type. Pick Kaggle and type just your username.
- **0:59** Star your main links: only those go on your share card.
- **1:06** A QR code that saves you straight into someone's contacts.
- **1:12** Keep separate Work and Personal profiles, and back everything up to a file.
- **1:22** It never reads the websites you visit; it only types when you choose Paste. No tracking, no network requests.
- **1:29** Social Links is free and open source. The link's in the description.
