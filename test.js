// Browse Files button - allows single or multiple selection
selectFilesBtn.addEventListener('click', async () => {
    // Open file picker dialog (always allow multiple selections)
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],  // User can select one or more files
        filters: [
            { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }
        ]
    });

    // If user selected files (didn't cancel)
    if (!result.canceled && result.filePaths.length > 0) {
        selectedFiles = result.filePaths;

        // Display selected file names
        fileListDiv.innerHTML = selectedFiles
            .map(f => `<div>✓ ${f.split('/').pop()}</div>`)  // Show only filename
            .join('');

        // Show/hide random checkbox based on number of files
        if (selectedFiles.length > 1) {
            randomSection.style.display = 'block';  // Show random option for multiple files
        } else {
            randomSection.style.display = 'none';   // Hide for single file (will just loop)
        }
    }
});