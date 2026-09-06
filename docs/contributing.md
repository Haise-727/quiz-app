# Contributing — Setup Guide for Beginners

This is the onboarding guide for new collaborators. For what the project *is*,
see the [README](../README.md).

This guide will help you set up everything you need to collaborate on our quiz app project. Don't worry if you're new to coding or Git - we've broken everything down into simple steps.

## What You'll Need (Required Software)

1. **Visual Studio Code (VS Code)** - A free code editor
   - Download from [https://code.visualstudio.com/](https://code.visualstudio.com/)
   - Installation: Just follow the setup wizard (Next > Next > Finish)

2. **Node.js** - Allows you to run JavaScript on your computer
   - Download from [https://nodejs.org/](https://nodejs.org/)
   - Choose the "LTS" version (Long Term Support)
   - Installation: Follow the setup wizard with default settings

3. **Git** - Tracks changes to our code
   - Download from [https://git-scm.com/downloads](https://git-scm.com/downloads)
   - Installation: Use default settings (click "Next" until done)

## Setting Up Your Workspace

### Step 1: Install Helpful VS Code Extensions

These extensions will make coding easier:

1. Open VS Code
2. Click the square icon on the left sidebar (Extensions)
3. Search for and install:
   - **ESLint** - Helps catch errors in your code
   - **GitHub Pull Requests and Issues** - Connect to GitHub directly
   - **ES7+ React/Redux/React-Native snippets** - Provides shortcuts for React

### Step 2: Clone the Repository (Getting the Code)

This downloads the project to your computer:

**Method 1: Using VS Code Interface (Easiest for Beginners)**
1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac) 
3. Type `Git: Clone` and press Enter
4. Paste the repository URL: `https://github.com/[OWNER-USERNAME]/quiz-app.git`
5. Choose a folder on your computer to save the project
6. Click "Open" when prompted to open the cloned repository

**Method 2: Using Terminal/Command Line**
1. Open VS Code
2. Press `` Ctrl+` `` to open the terminal
3. Navigate to where you want to store the project:
   ```
   cd Documents
   ```
   (You can replace "Documents" with any folder path)
4. Clone the repository:
   ```
   git clone https://github.com/[OWNER-USERNAME]/quiz-app.git
   ```
5. Enter the project folder:
   ```
   cd quiz-app
   ```

### Step 3: Install Project Dependencies

After cloning, you need to install the project's required packages:

1. In VS Code, make sure you're in the project folder
2. Open the terminal if it's not already open (`` Ctrl+` ``)
3. Type this command and press Enter:
   ```
   npm install
   ```
4. Wait for installation to complete (may take a few minutes)

### Step 4: Run the Project Locally

To see the project running on your computer:

1. In the terminal, type:
   ```
   npm run dev
   ```
2. Wait for the message saying the server is running
3. Open your web browser and go to the URL shown in the terminal (usually `http://localhost:5173` or similar)

## Working on the Project Safely

### Understanding Branches

Think of branches like separate workspaces:
- `main` branch - The official, working version of our app
- `main-update` branch - Where we make and test changes before they go to `main`

As a collaborator, you'll only work on the `main-update` branch for safety reasons.

### Step 1: Switch to the main-update Branch

Before making any changes, make sure you're on the right branch:

1. In VS Code terminal, type:
   ```
   git checkout main-update
   ```

   If this gives an error about the branch not existing, create it first:
   ```
   git checkout -b main-update
   ```

2. You should see "(main-update)" appear in the bottom-left corner of VS Code

### Step 2: Making Changes to the Code

Now you can make changes to the files in the project:

1. Open files by clicking on them in the Explorer panel (left side)
2. Make your edits
3. Save files with `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac)

### Step 3: Committing Your Changes

After making changes, you need to "commit" them (save them to Git):

**Method 1: Using VS Code Interface (Recommended for Beginners)**
1. Click the Source Control icon in the left sidebar (looks like a branch)
2. You'll see a list of changed files
3. Click the "+" next to each file you want to commit (or click "+" next to "Changes" to add all)
4. Type a message describing what you changed in the text box
5. Click the checkmark (✓) above the message box to commit

**Method 2: Using Terminal Commands**
1. Add your changes:
   ```
   git add .
   ```
2. Commit with a message:
   ```
   git commit -m "Describe what you changed here"
   ```

### Step 4: Pushing Your Changes to GitHub

To send your changes to the online repository:

**Method 1: Using VS Code Interface**
1. In the Source Control panel, click the "..." menu
2. Select "Push"
3. If prompted, make sure you're pushing to "origin/main-update"

**Method 2: Using Terminal**
1. Type:
   ```
   git push origin main-update
   ```

## Important: Never Push to Main!

Always double-check that you are pushing to `main-update` branch, not to `main`.

## What Happens Next?

1. After pushing your changes to `main-update`, notify the project admin (team leader)
2. The admin will review your changes and merge them into the `main` branch
3. Wait for confirmation before starting new changes

## Common Issues & Solutions

### "There are uncommitted changes" Error
- Save all your files first
- Go to Source Control panel and commit your changes

### "Failed to push" Error
- Your local copy might be out of date. Try this in terminal:
  ```
  git pull origin main-update
  ```
  Then try pushing again

### Files Not Appearing After Clone
- Make sure you opened the correct folder in VS Code
- Click "File > Open Folder" and select the quiz-app folder

## Need Help?

If you get stuck or have questions:
1. Try searching for the error message online
2. Contact the project admin for assistance

## Git Commands Quick Reference

Here are the most important commands you'll use:

```
git status              # Check which files you've changed
git checkout main-update # Switch to the main-update branch
git pull origin main-update # Get latest updates from GitHub
git add .               # Add all changed files to your commit
git commit -m "Message" # Save your changes with a description
git push origin main-update # Send your changes to GitHub
```

Remember: Always work on the `main-update` branch and never push directly to `main`!