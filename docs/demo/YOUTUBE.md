# YouTube upload kit — Social Links demo

**Video:** `social-links-demo.mp4` (1920×1080, 30 fps, H.264 + AAC, 1:17)
**Thumbnail:** `social-links-thumbnail.png` (1280×720)
**Captions:** `social-links-demo.en.srt` (English)

## Title (pick one, under 70 characters)
1. Social Links: copy your LinkedIn & GitHub with one right-click
2. Stop retyping your LinkedIn URL: a free right-click browser extension
3. Social Links extension demo: open, copy & add profile links anywhere

## Description
```
Tired of typing your LinkedIn, GitHub and portfolio URLs into every job application and hackathon form? Social Links puts all your profile links in your browser's right-click menu.

▶ Get it (free, open source): https://github.com/mukeshkbj/SocialLinks

What it does
• Right-click anywhere › Social links › Copy or Open any saved link
• Right-click a profile link › + Add this link (platform and username detected)
• + means not added yet, ✎ means saved: click to edit
• Add any other site under your own name (Kaggle, Behance, portfolio)
• Work and Personal profiles
• Share card: QR code + vCard so people can save you as a contact
• Back up and restore with a preview

Private by design: it never reads or changes the websites you visit. No tracking, no analytics, no network requests. Your links sync through your own browser account.

Works in Chrome, Edge, Brave, Opera and Firefox. Install steps are in the README.

Chapters
0:00 What Social Links does
0:10 Copy and open links from the right-click menu
0:26 Save links and manage them from the toolbar
0:47 Profiles, share card and backup
1:03 Privacy and where to get it

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
- **End screen (optional):** add a "Subscribe" element and a link to the GitHub repo in the last 5–20 seconds (the video's end card is 6.5 seconds).
- **Visibility:** start as **Unlisted** to check it, then switch to **Public**.

## Optional voiceover
The video has music and on-screen captions but no narration. To add your own voice, record the script below (about 160 words, 75 seconds at a relaxed pace). Then in YouTube Studio › Editor › Audio, lower the music, or replace the track before uploading:

```
ffmpeg -i social-links-demo.mp4 -i voice.wav -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k social-links-demo-voice.mp4
```

### Narration script (lines start at these times)
- **0:00** This is Social Links, your profile links one right-click away.
- **0:05** Every application asks for the same links.
- **0:09** Right-click, Social links, LinkedIn, Copy, and paste. Done.
- **0:16** Same for GitHub, or any link you've saved.
- **0:21** You can open them in a new tab too.
- **0:26** To save a link, right-click it and choose "Add this link". It works out the platform and username for you.
- **0:34** Everything lives behind the toolbar button. Plus means not added yet; the pencil means saved.
- **0:41** Add any other site with your own name, like Kaggle or a portfolio.
- **0:47** Keep separate Work and Personal profiles.
- **0:53** Share a QR code that saves you straight into someone's contacts.
- **0:59** And back everything up to a file.
- **1:04** It never reads the websites you visit, with no tracking and no network requests.
- **1:10** Social Links is free and open source. The link's in the description.
