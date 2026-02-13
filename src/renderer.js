// Import required Node.js modules
const { dialog } = require('@electron/remote');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Get references to HTML elements
const selectFilesBtn = document.getElementById('selectFiles');
const fileListDiv = document.getElementById('fileList');
const targetHoursInput = document.getElementById('targetHours');
const outputSection = document.getElementById('outputSection');
const outputPathInput = document.getElementById('outputPath');
const changeOutputBtn = document.getElementById('changeOutputBtn');
const outputInfo = document.getElementById('outputInfo');
const startBtn = document.getElementById('startBtn');
const progressSection = document.getElementById('progressSection');
const progress1 = document.getElementById('progress1');
const progress1Text = document.getElementById('progress1Text');
const progress2 = document.getElementById('progress2');
const progress2Text = document.getElementById('progress2Text');
const randomSection = document.getElementById('randomSection');
const randomCheckbox = document.getElementById('randomOrder');

// Store selected files and output path
let selectedFiles = [];
let currentOutputPath = '';

// Get actual duration using ffprobe
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        const { execFile } = require('child_process');

        execFile('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ], (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(parseFloat(stdout.trim()));
        });
    });
}

// Calculate estimated output size accurately
async function calculateEstimatedSize(files, targetHours) {
    try {
        // Get all file sizes and durations
        let totalSize = 0;
        let totalDuration = 0;

        for (const file of files) {
            const stats = fs.statSync(file);
            const duration = await getVideoDuration(file);

            totalSize += stats.size;
            totalDuration += duration;
        }

        // Calculate bitrate (bytes per second)
        const bitrate = totalSize / totalDuration;

        // Estimate output size
        const targetSeconds = targetHours * 3600;
        const estimatedSize = bitrate * targetSeconds;

        return estimatedSize;
    } catch (e) {
        console.error('Error calculating size:', e);
        // Fallback rough estimate
        return files.reduce((sum, f) => sum + fs.statSync(f).size, 0) * targetHours;
    }
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Check available disk space
function checkDiskSpace(filePath, requiredSize) {
    // Get directory from file path
    const dir = path.dirname(filePath);

    // This is a simplified check - in production use a proper disk space library
    // For now, we'll skip this check and implement it later
    return true;
}

// Update output path and info
async function updateOutputInfo() {
    if (selectedFiles.length === 0) return;

    const hours = parseFloat(targetHoursInput.value) || 10;

    // Generate default output path if not set
    if (!currentOutputPath) {
        const sourceDir = path.dirname(selectedFiles[0]);
        const baseName = selectedFiles.length === 1
            ? path.basename(selectedFiles[0], path.extname(selectedFiles[0]))
            : 'combined';
        currentOutputPath = path.join(sourceDir, `${baseName}_${hours}h.mp4`);
    }

    outputPathInput.value = currentOutputPath;

    // Show "Calculating..." while getting size
    outputInfo.innerHTML = `Calculating size...`;

    // Calculate and show estimated size
    const estimatedSize = await calculateEstimatedSize(selectedFiles, hours);
    outputInfo.innerHTML = `Estimated size: ~${formatBytes(estimatedSize)}`;

    // Show output section
    outputSection.style.display = 'block';
}

// Browse Files button
selectFilesBtn.addEventListener('click', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        selectedFiles = result.filePaths;

        // Display selected file names
        fileListDiv.innerHTML = selectedFiles
            .map(f => `<div>✓ ${f.split('/').pop()}</div>`)
            .join('');

        // Show/hide random checkbox
        if (selectedFiles.length > 1) {
            randomSection.style.display = 'block';
        } else {
            randomSection.style.display = 'none';
        }

        // Reset and update output
        currentOutputPath = '';
        updateOutputInfo();

        // Reset progress
        progressSection.style.display = 'none';
        progress1.value = 0;
        progress1Text.textContent = '0%';
        progress2.value = 0;
        progress2Text.textContent = '0%';
        startBtn.disabled = false;
    }
});

// Change output location button
changeOutputBtn.addEventListener('click', async () => {
    const hours = parseFloat(targetHoursInput.value) || 10;
    const baseName = selectedFiles.length === 1
        ? path.basename(selectedFiles[0], path.extname(selectedFiles[0]))
        : 'combined';

    const result = await dialog.showSaveDialog({
        title: 'Save output video',
        defaultPath: path.join(path.dirname(selectedFiles[0]), `${baseName}_${hours}h.mp4`),
        filters: [
            { name: 'MP4 Video', extensions: ['mp4'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        currentOutputPath = result.filePath;
        updateOutputInfo();
    }
});

// Update output info when hours change
targetHoursInput.addEventListener('input', () => {
    if (selectedFiles.length > 0) {
        // Reset output path to regenerate with new hours
        currentOutputPath = '';
        updateOutputInfo();
    }
});

// Start Processing button
startBtn.addEventListener('click', async () => {
    // Validate files
    if (selectedFiles.length === 0) {
        alert('Please select video files first!');
        return;
    }

    // Validate hours
    const hours = parseFloat(targetHoursInput.value);
    if (hours <= 0 || hours > 100 || isNaN(hours)) {
        alert('Please enter valid hours (0.01-100)');
        return;
    }

    // Validate output path
    if (!currentOutputPath) {
        alert('Please set output location!');
        return;
    }

    // Check disk space (simplified for now)
    const estimatedSize = calculateEstimatedSize(selectedFiles, hours);
    // TODO: Implement proper disk space check

    const random = selectedFiles.length > 1 ? randomCheckbox.checked : false;

    // Reset progress bars
    progress1.value = 0;
    progress1Text.textContent = '0%';
    progress2.value = 0;
    progress2Text.textContent = '0%';

    // Show progress section
    progressSection.style.display = 'block';
    startBtn.disabled = true;

    // Run Python script
    runPythonProcessor(selectedFiles, hours, random, currentOutputPath);
});
// Function to run Python video processor
function runPythonProcessor(files, hours, randomize, outputPath) {
    const scriptPath = path.join(__dirname, 'video_processor.py');
    const filesJson = JSON.stringify(files);
    const randomFlag = randomize ? 'true' : 'false';

    // Store error messages
    let errorMessages = [];

    const pythonProcess = spawn('python3', [
        scriptPath,
        filesJson,
        hours.toString(),
        randomFlag,
        outputPath
    ]);

    // Listen to Python output (stdout)
    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        lines.forEach(line => {
            if (line.startsWith('PROGRESS:')) {
                try {
                    const progressJson = line.substring(9);
                    const progress = JSON.parse(progressJson);
                    
                    if (progress.stage === 1) {
                        progress1.value = progress.percent;
                        progress1Text.textContent = Math.round(progress.percent) + '%';
                        
                        if (progress.percent >= 99.5) {
                            document.getElementById('progress2Note').style.display = 'block';
                        }
                    } else if (progress.stage === 2) {
                        progress2.value = progress.percent;
                        progress2Text.textContent = Math.round(progress.percent) + '%';
                        
                        if (progress.percent >= 99.5) {
                            document.getElementById('progress2Note').style.display = 'none';
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse progress:', e);
                }
            }
        });
    });

    // Listen to Python errors (stderr)
    pythonProcess.stderr.on('data', (data) => {
        const message = data.toString();
        console.log('Python:', message);
        
        // Collect ERROR messages for user display
        if (message.includes('ERROR:')) {
            errorMessages.push(message.replace('ERROR:', '').trim());
        }
    });

    // When Python process exits
    pythonProcess.on('close', (code) => {
        if (code === 0) {
            alert(`✅ Processing complete!\n\nVideo saved to:\n${outputPath}`);
        } else {
            // Show specific error messages from Python
            const errorText = errorMessages.length > 0 
                ? errorMessages.join('\n')
                : 'Check console for details.';
            alert(`❌ Processing failed!\n\n${errorText}`);
        }
        
        startBtn.disabled = false;
    });

    // Handle process errors
    pythonProcess.on('error', (err) => {
        alert(`❌ Failed to start Python process:\n${err.message}\n\nMake sure Python 3 is installed.`);
        startBtn.disabled = false;
    });
}