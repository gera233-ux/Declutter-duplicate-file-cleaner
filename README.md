# Declutter - Professional Duplicate File Cleaner

Declutter is an easy-to-use Electron application designed to help professionals find and remove duplicate files, freeing up valuable disk space and optimizing system performance. It provides a streamlined interface for scanning selected folders, identifying duplicates, and safely deleting unnecessary files.

## Features

- **Selective Folder Scanning**: Choose specific folders to scan for duplicates
- **Progress Tracking**: Real-time progress updates during scanning
- **Smart Duplicate Detection**: Identifies duplicate files across selected directories
- **Space Saving Calculations**: Shows potential storage space that can be reclaimed
- **Selective Deletion**: Review and choose which duplicate files to delete
- **Professional UI**: Clean, intuitive interface for efficient file management

## Installation

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Setup Steps
1. Clone this repository:
   ```bash
   
   cd Declutter-duplicate-file-cleaner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the application:
   ```bash
   npm start
   ```

2. Select the folders you want to scan for duplicate files by clicking "📁 Select Folders".

3. Click "🔍 Start Scanning" to begin the duplicate detection process.

4. Review the results showing found duplicates and potential space savings.

5. Select the duplicates you wish to delete and click "🗑️ Delete Selected" to remove them.

6. Use "⟲ Start Again" to perform another scan if needed.

## Development

To rebuild native modules during development:
```bash
npm run rebuild
```

## Building for Distribution

To build the application for Windows:
```bash
npm run build-win
```

## Distribution

The app is built for Windows using Electron 22.0.0, making it compatible with Windows 10, Windows 11, and potentially Windows 8.1 (though not officially supported). It is **not compatible** with Windows 7 or earlier versions, as Electron 22.0.0 requires modern Windows APIs and doesn't support older systems.


## License

This project is licensed under the MIT License - see the package.json for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Developed by Your gera233
