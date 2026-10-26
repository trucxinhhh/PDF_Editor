/* =====================================================================
   Đa ngôn ngữ (Tiếng Việt / English)
   Giao diện gốc viết bằng tiếng Việt. Khi chọn English, mọi chữ hiển thị
   (kể cả thông báo sinh ra sau) được dịch tự động theo bảng dưới đây.
   - EXACT: câu cố định
   - PATTERNS: câu có phần thay đổi. {0},{1}: bất kỳ; {#0}: chỉ số.
     Phần thay đổi cũng được dịch tiếp nếu có trong bảng.
   ===================================================================== */

const EXACT = {
  // ---- thanh công cụ
  'Mở file PDF': 'Open a PDF file',
  'Mở PDF': 'Open PDF',
  'Mở dự án đã lưu (.pdfedit.json)': 'Open a saved project (.pdfedit.json)',
  'Mở dự án': 'Open project',
  'Tách, ghép, chèn trang PDF': 'Split, merge, insert PDF pages',
  'Tách / Ghép ▾': 'Split / Merge ▾',
  'Tách PDF': 'Split PDF',
  'Cắt tài liệu thành nhiều file, trích xuất trang': 'Cut a document into several files, extract pages',
  'Ghép / Chèn PDF': 'Merge / Insert PDF',
  'Ghép nhiều file, chèn trang, sắp xếp, xoay, xoá': 'Merge files, insert, reorder, rotate, delete pages',
  'Thanh trang: sắp xếp, xoay, xoá, thêm trang, ghép / tách PDF': 'Pages panel: reorder, rotate, delete, add pages, merge / split PDF',
  'Tìm kiếm chữ (Ctrl+F)': 'Search text (Ctrl+F)',
  'Tìm': 'Search',
  'Trang': 'Pages',
  'Chọn / di chuyển, bôi đen chữ để copy (V)': 'Select / move, highlight text to copy (V)',
  'Chọn': 'Select',
  'Chèn văn bản: bấm vào trang (T)': 'Insert text: click on the page (T)',
  'Văn bản': 'Text',
  'Chèn ảnh đè lên trang (I)': 'Place an image on the page (I)',
  'Ảnh': 'Image',
  'Highlight: kéo trên dòng chữ để tô theo dòng, bấm 1 lần để tô cả dòng (H)': 'Highlight: drag over text to highlight by line, click once to highlight a whole line (H)',
  'Vẽ hình: chữ nhật, elip, đường thẳng, mũi tên, bút vẽ tự do (S)': 'Draw shapes: rectangle, ellipse, line, arrow, freehand pen (S)',
  'Hình': 'Shape',
  'Che trắng / che màu một vùng (W)': 'White-out / cover an area with a color (W)',
  'Che vùng': 'Cover',
  'Chú thích (sticky note): bấm vào trang (C)': 'Comment (sticky note): click on the page (C)',
  'Chú thích': 'Comment',
  'Sửa chữ gốc: bấm vào dòng chữ có sẵn trong PDF (E)': 'Edit original text: click a line of text in the PDF (E)',
  'Sửa chữ gốc': 'Edit text',
  'Hoàn tác (Ctrl+Z)': 'Undo (Ctrl+Z)',
  'Làm lại (Ctrl+Y)': 'Redo (Ctrl+Y)',
  'Xoá đối tượng đang chọn (Delete)': 'Delete selected object (Delete)',
  'Xoá': 'Delete',
  'Thu nhỏ': 'Zoom out',
  'Phóng to': 'Zoom in',
  'Lưu toàn bộ (PDF gốc + phần đã thêm) để mở lại sửa tiếp': 'Save everything (original PDF + your additions) to continue later',
  'Lưu dự án': 'Save project',
  'Chuyển đổi Word': 'Word conversion',
  'PDF gốc → Word (.docx)': 'Original PDF → Word (.docx)',
  'PDF đã chỉnh → Word (.docx)': 'Edited PDF → Word (.docx)',
  'Word (.docx) → PDF…': 'Word (.docx) → PDF…',
  'Xuất PDF mới (Ctrl+S)': 'Export new PDF (Ctrl+S)',
  'Xuất PDF': 'Export PDF',
  'Chuyển ngôn ngữ': 'Change language',

  // ---- thanh thuộc tính
  'Hình chữ nhật': 'Rectangle',
  'Hình elip / tròn': 'Ellipse / circle',
  'Hình elip': 'Ellipse',
  'Đường thẳng (giữ Shift: thẳng góc 45°)': 'Line (hold Shift: snap to 45°)',
  'Mũi tên (giữ Shift: thẳng góc 45°)': 'Arrow (hold Shift: snap to 45°)',
  'Đường thẳng': 'Line',
  'Mũi tên': 'Arrow',
  'Bút vẽ tự do': 'Freehand pen',
  'Bút vẽ': 'Pen',
  'Cách tô': 'Highlight mode',
  'Tô theo dòng chữ': 'Follow text lines',
  'Tô vùng tự do': 'Free area',
  'Kiểu đánh dấu': 'Markup style',
  'Tô nền': 'Highlight',
  'Gạch chân': 'Underline',
  'Gạch ngang': 'Strikeout',
  'Màu': 'Color',
  'Màu nét': 'Stroke',
  'Chọn màu khác': 'Pick another color',
  'Nền': 'Fill',
  'Chọn màu nền khác': 'Pick another fill color',
  'Không tô nền': 'No fill',
  'Nét': 'Width',
  'Độ dày nét (pt)': 'Stroke width (pt)',
  'Cỡ': 'Size',
  'Cỡ chữ': 'Font size',
  'In đậm': 'Bold',
  'Độ đậm': 'Opacity',
  'Độ đậm / trong suốt': 'Opacity / transparency',
  'Tô nền trắng vùng chữ cũ thay vì giữ nền gốc': 'Paint the old text area white instead of keeping the original background',
  'Nền trắng': 'White background',
  'Chọn một công cụ hoặc một đối tượng để chỉnh thuộc tính.': 'Choose a tool or an object to edit its properties.',
  'Kéo để di chuyển, kéo góc dưới để đổi cỡ (giữ Shift để co giãn tự do).': 'Drag to move, drag the bottom corner to resize (hold Shift for free resize).',
  'Chọn file ảnh rồi bấm vào trang để đặt.': 'Choose an image file, then click on the page to place it.',
  'Văn bản ': 'Text ',
  'Sửa chữ gốc ': 'Edit text ',
  'Highlight': 'Highlight',

  // ---- thông báo ảnh scan
  'Đóng': 'Close',
  'Highlight chỉ tô được theo vùng tự do (không tô theo dòng chữ).': 'Highlighting only works as free areas (not by text line).',
  'Không thể dùng “Sửa chữ gốc” hay bôi đen để copy chữ trên trang này.': 'You can’t use “Edit text” or select text to copy on this page.',
  'Không thể dùng “Sửa chữ gốc” hay bôi đen để copy chữ trên những trang đó.': 'You can’t use “Edit text” or select text to copy on those pages.',

  // ---- thanh trang
  'Đóng thanh trang': 'Close pages panel',
  'Ghép thêm file PDF khác vào sau trang đang chọn (hoặc cuối tài liệu)': 'Merge other PDF files after the selected page (or at the end)',
  '＋ Ghép PDF': '＋ Merge PDF',
  'Tách tài liệu thành nhiều file PDF': 'Split the document into several PDF files',
  '✂ Tách PDF': '✂ Split PDF',
  'Xoay trái 90°': 'Rotate left 90°',
  'Xoay phải 90°': 'Rotate right 90°',
  'Nhân bản trang': 'Duplicate page',
  'Thêm trang trắng sau trang đang chọn': 'Add a blank page after the selected page',
  'Trích xuất các trang đang chọn thành file PDF mới': 'Extract the selected pages to a new PDF',
  'Xoá các trang đang chọn (Delete)': 'Delete selected pages (Delete)',
  'Bấm để chọn · Ctrl/Shift + bấm: chọn nhiều · Kéo để sắp xếp · Thả file PDF vào đây để chèn': 'Click to select · Ctrl/Shift + click: multi-select · Drag to reorder · Drop a PDF here to insert it',

  // ---- tìm kiếm
  'Tìm trong PDF…': 'Search in PDF…',
  'Kết quả trước (Shift+Enter)': 'Previous result (Shift+Enter)',
  'Kết quả tiếp theo (Enter)': 'Next result (Enter)',
  'Phân biệt chữ hoa / chữ thường': 'Match case',
  'Phân biệt dấu tiếng Việt (bỏ chọn: gõ không dấu vẫn tìm được)': 'Match Vietnamese accents (off: typing without accents still finds accented text)',
  'Dấu': 'Accents',
  'Đóng (Esc)': 'Close (Esc)',
  'Không thấy': 'No results',
  'Không tìm thấy. Lưu ý: trang ảnh scan không có chữ nên không tìm được.': 'Not found. Note: scanned image pages contain no text and can’t be searched.',

  // ---- màn hình bắt đầu
  'Kéo thả file PDF vào đây hoặc bấm': 'Drag & drop a PDF here or click',
  'Chia 1 file thành nhiều file': 'Split one file into several',
  'Ghép PDF': 'Merge PDF',
  'Gộp nhiều file thành 1': 'Combine several files into one',
  'Chèn ảnh, văn bản, highlight, che vùng, chú thích': 'Add images, text, highlights, cover areas, comments',
  'Sửa trực tiếp chữ có sẵn trong PDF': 'Edit the existing text of the PDF directly',
  'Bôi đen để copy chữ, Ctrl+C / Ctrl+V để nhân bản đối tượng, dán ảnh từ clipboard': 'Select text to copy, Ctrl+C / Ctrl+V to duplicate objects, paste images from the clipboard',
  'Xuất PDF mới, chuyển PDF ⇄ Word': 'Export a new PDF, convert PDF ⇄ Word',

  // ---- trạng thái / gợi ý
  'Mở một file PDF để bắt đầu.': 'Open a PDF file to get started.',
  'Đang xử lý…': 'Processing…',
  'Chọn: bấm vào đối tượng để chọn/kéo, nhấp đúp vào chữ để sửa. Bôi đen chữ trong PDF để copy (Ctrl+C).': 'Select: click an object to select/drag it, double-click text to edit. Highlight PDF text to copy it (Ctrl+C).',
  'Văn bản: bấm vào vị trí trên trang rồi gõ chữ. Enter để xuống dòng, Esc để xong.': 'Text: click a spot on the page and type. Enter for a new line, Esc when done.',
  'Ảnh: chọn file ảnh rồi bấm vào trang để đặt. Có thể dán ảnh trực tiếp bằng Ctrl+V.': 'Image: choose an image file, then click on the page to place it. You can also paste an image with Ctrl+V.',
  'Highlight: kéo trên chữ để tô theo dòng (tự bắt theo từng ký tự), bấm 1 lần vào dòng để tô cả dòng. Kéo ở vùng trống để tô vùng tự do.': 'Highlight: drag over text to highlight by line (snaps to characters), click a line once to highlight all of it. Drag on empty space for a free area.',
  'Hình: chọn loại hình ở thanh bên dưới rồi kéo chuột trên trang. Giữ Shift để vẽ hình vuông/tròn hoặc đường thẳng góc 45°.': 'Shape: pick a shape in the bar below, then drag on the page. Hold Shift for squares/circles or 45° lines.',
  'Che vùng: kéo chuột để che nội dung (đổi màu ở ô Màu).': 'Cover: drag to cover content (change the color in the Color box).',
  'Chú thích: bấm vào trang để thêm ghi chú (sticky note, hiện trong Acrobat/Foxit).': 'Comment: click on the page to add a note (sticky note, visible in Acrobat/Foxit).',
  'Sửa chữ gốc: bấm vào một dòng chữ có khung xanh để sửa trực tiếp nội dung đó.': 'Edit text: click a line with a blue frame to edit its content directly.',
  'Bấm vào vị trí trên trang để đặt ảnh (Esc để huỷ).': 'Click on the page to place the image (Esc to cancel).',

  // ---- trên trang
  'Nhập chú thích…': 'Type a comment…',

  // ---- thông báo
  'Không tải được tài liệu từ server': 'Could not load the document from the server',
  'Đang mở PDF…': 'Opening PDF…',
  'Các thay đổi chưa lưu sẽ mất. Tiếp tục mở file mới?': 'Unsaved changes will be lost. Open the new file anyway?',
  'Không phải file dự án PDF Editor': 'Not a PDF Editor project file',
  'Đã lưu dự án. Dùng "Mở dự án" để sửa tiếp sau này.': 'Project saved. Use "Open project" to continue editing later.',
  'Đang hoàn tác…': 'Undoing…',
  'Hãy chọn file ảnh (png, jpg, gif, webp…)': 'Please choose an image file (png, jpg, gif, webp…)',
  'Không đọc được ảnh này (file hỏng hoặc định dạng không hỗ trợ). Hãy thử ảnh JPG/PNG khác.': 'Could not read this image (damaged file or unsupported format). Try another JPG/PNG image.',
  'Đã highlight phần chữ đã bôi đen': 'Highlighted the selected text',
  'Hãy mở PDF trước': 'Please open a PDF first',
  'Đang tạo PDF…': 'Creating PDF…',
  'Đã xuất PDF mới': 'New PDF exported',
  'PDF này có trang là ảnh scan (không có chữ thật). File Word tạo ra sẽ chỉ chứa hình ảnh của trang, không sửa chữ được. Vẫn tiếp tục?': 'This PDF has scanned image pages (no real text). The Word file will only contain page images and the text won’t be editable. Continue anyway?',
  'Đang chuyển sang Word… (file lớn có thể mất vài phút)': 'Converting to Word… (large files may take a few minutes)',
  'Đã tạo file Word. Mở bằng Word để sửa chữ trực tiếp.': 'Word file created. Open it in Word to edit the text directly.',
  'Đang chuyển Word → PDF…': 'Converting Word → PDF…',
  'Đã chuyển xong. Mở PDF này trong trình chỉnh sửa?': 'Conversion finished. Open this PDF in the editor?',
  'Các thay đổi chưa lưu ở file hiện tại sẽ mất. Tiếp tục?': 'Unsaved changes in the current file will be lost. Continue?',
  'Đã copy đối tượng. Ctrl+V để dán.': 'Object copied. Press Ctrl+V to paste.',
  'Hãy mở PDF trước, rồi kéo ảnh vào trang.': 'Open a PDF first, then drag the image onto a page.',
  'Đã thêm ảnh': 'Image added',
  'Chỉ hỗ trợ file PDF, ảnh hoặc dự án .json': 'Only PDF, image or .json project files are supported',
  'Đang lấy ảnh…': 'Fetching image…',
  'Không nhận được ảnh từ nội dung vừa kéo thả. Hãy lưu ảnh về máy rồi kéo file vào, hoặc copy ảnh rồi dán bằng Ctrl+V.': 'No image found in what you dropped. Save the image to your computer and drag the file in, or copy the image and paste it with Ctrl+V.',
  'Tài liệu phải còn ít nhất 1 trang.': 'The document must keep at least 1 page.',
  'Tài liệu phải còn ít nhất 1 trang': 'The document must keep at least 1 page',
  'Đang cập nhật trang…': 'Updating pages…',
  'Đang xoay trang…': 'Rotating pages…',
  'Không thể xoá hết các trang. Tài liệu phải còn ít nhất 1 trang.': 'You can’t delete every page. The document must keep at least 1 page.',
  'Đang xoá trang…': 'Deleting pages…',
  'Đang nhân bản trang…': 'Duplicating pages…',
  'Đang thêm trang…': 'Adding page…',
  'Đã thêm 1 trang trắng': 'Added 1 blank page',
  'Đang sắp xếp trang…': 'Reordering pages…',
  'Hãy chọn file PDF.': 'Please choose PDF files.',
  'Đang ghép PDF…': 'Merging PDF…',
  'Hãy nhập khoảng trang, ví dụ: 1-3, 4-6': 'Enter page ranges, e.g. 1-3, 4-6',
  'Đang tách PDF…': 'Splitting PDF…',
  'Đã tạo file PDF': 'PDF file created',
  'Chưa có thay đổi nào.': 'Nothing has changed yet.',

  // ---- màn hình Tách / Ghép
  'Quay lại trình chỉnh sửa (Esc)': 'Back to the editor (Esc)',
  '← Quay lại': '← Back',
  'Tách': 'Split',
  'Ghép / Chèn': 'Merge / Insert',
  'Chọn cách tách': 'How to split',
  'Cắt thủ công': 'Cut manually',
  'Bấm biểu tượng ✂ giữa các trang để cắt': 'Click the ✂ icon between pages to cut',
  'Trích xuất trang': 'Extract pages',
  'Bấm chọn các trang muốn lấy ra': 'Click the pages you want to extract',
  'Theo khoảng trang': 'By page ranges',
  'Ví dụ: 1-3, 4-6, 8': 'Example: 1-3, 4-6, 8',
  'Cứ mỗi N trang': 'Every N pages',
  'Chia đều thành các file N trang': 'Split evenly into files of N pages',
  'Gồm cả các phần đã thêm / chỉnh sửa': 'Include your additions / edits',
  'Cắt từng trang': 'Cut every page',
  'Bỏ hết đường cắt': 'Remove all cuts',
  'Mẹo: di chuột vào khe giữa hai trang rồi bấm ✂ để thêm/bỏ đường cắt.': 'Tip: hover the gap between two pages and click ✂ to add/remove a cut.',
  'Chọn tất cả': 'Select all',
  'Bỏ chọn': 'Clear selection',
  'Gộp các trang đã chọn thành 1 file': 'Combine selected pages into 1 file',
  'Mỗi trang đã chọn thành 1 file riêng': 'Each selected page as a separate file',
  'Các khoảng trang, cách nhau bằng dấu phẩy:': 'Page ranges, separated by commas:',
  'Chưa có gì để tách': 'Nothing to split yet',
  'Chưa có đường cắt nào – kết quả sẽ giống file gốc. Hãy bấm ✂ giữa các trang để cắt.': 'No cuts yet – the result would be identical to the original. Click ✂ between pages to cut.',
  'Bấm vào biểu tượng kéo giữa hai trang để cắt tài liệu tại đó. Mỗi phần có màu riêng sẽ thành 1 file.': 'Click the scissors between two pages to cut the document there. Each colored part becomes 1 file.',
  'Bấm vào các trang muốn lấy ra (trang được chọn có dấu ✓).': 'Click the pages you want to extract (selected pages show ✓).',
  'Nhập khoảng trang ở bên phải. Trang mờ là trang không nằm trong khoảng nào.': 'Enter page ranges on the right. Faded pages aren’t in any range.',
  'Bấm vào các trang muốn trích xuất.': 'Click the pages you want to extract.',
  'Chưa cắt – sẽ giống file gốc': 'No cuts – same as the original',
  'Đã tách xong!': 'Split complete!',
  'File đã được tải về máy.': 'The file has been downloaded.',
  'Tải xuống lại': 'Download again',
  'Tách tiếp file này': 'Split this file again',
  'Quay lại trình chỉnh sửa': 'Back to the editor',
  'Cứ mỗi': 'Every',
  'Chưa có trang nào': 'No pages yet',
  'Trang trắng': 'Blank page',
  '· Trang trắng': '· Blank page',
  '＋ Chọn file PDF để ghép': '＋ Choose PDF files to merge',
  'hoặc kéo thả nhiều file PDF vào đây': 'or drag & drop several PDF files here',
  'Kéo thả để sắp xếp trang · Di chuột vào trang để xoay / nhân bản / xoá ·': 'Drag & drop to reorder pages · Hover a page to rotate / duplicate / delete ·',
  'Bấm chọn 1 trang': 'Click a page',
  'để đặt vị trí chèn file mới (vạch xanh), bấm lại để bỏ chọn.': 'to set where new files are inserted (blue bar), click again to deselect.',
  '＋ Thêm file PDF': '＋ Add PDF files',
  'File mới sẽ được': 'New files will be',
  'File mới sẽ được thêm vào': 'New files will be added at the',
  'cuối': 'end',
  '. Bấm chọn 1 trang để chèn vào giữa.': '. Click a page to insert in between.',
  'Có thể kéo thả file PDF vào vùng trang bên trái.': 'You can also drag PDF files onto the pages on the left.',
  'Tài liệu hiện tại': 'Current document',
  'Chưa có file nào': 'No files yet',
  'Bỏ file này': 'Remove this file',
  '＋ Trang trắng': '＋ Blank page',
  '⇅ Đảo thứ tự': '⇅ Reverse order',
  '↺ Làm lại': '↺ Reset',
  'Huỷ mọi thay đổi trong màn hình này': 'Discard all changes on this screen',
  'Bấm “Áp dụng” để cập nhật tài liệu đang sửa (vẫn hoàn tác được bằng Ctrl+Z).': 'Click “Apply” to update the document you’re editing (still undoable with Ctrl+Z).',
  'Bấm “Ghép” để mở tài liệu đã ghép trong trình chỉnh sửa.': 'Click “Merge” to open the merged document in the editor.',
  'Áp dụng vào tài liệu': 'Apply to document',
  'Ghép & tải về PDF': 'Merge & download PDF',
  'Xoay 90°': 'Rotate 90°',
  'Nhân bản': 'Duplicate',
  'Xoá trang': 'Delete page',
  'Hiện tại': 'Current',

  // ---- gôm
  'Gôm': 'Eraser',
  'Gôm: bấm hoặc kéo qua các phần đã thêm / đã sửa để xoá (X)': 'Eraser: click or drag over your additions / edits to remove them (X)',
  'Gôm: bấm vào hoặc kéo qua các phần đã thêm / đã sửa để xoá chúng. Ctrl+Z để lấy lại.': 'Eraser: click or drag over your additions / edits to remove them. Ctrl+Z to bring them back.',
  'Bấm hoặc kéo qua các phần đã thêm / đã sửa để xoá.': 'Click or drag over your additions / edits to remove them.',
  'Xoá hết trên trang này': 'Clear this page',
  'Xoá hết mọi trang': 'Clear all pages',
  'Xoá mọi phần đã thêm / sửa trên trang đang xem': 'Remove all additions / edits on the current page',
  'Xoá mọi phần đã thêm / sửa trong cả tài liệu': 'Remove all additions / edits in the whole document',
  'Trang này chưa có phần nào được thêm / sửa.': 'This page has no additions / edits yet.',
  'Chưa có phần nào được thêm / sửa.': 'There are no additions / edits yet.',
  'Chèn vào đây': 'Insert here',

  // ---- thông báo từ server
  'doc id không hợp lệ': 'invalid document id',
  'Không tìm thấy file trên server, hãy mở lại PDF.': 'File not found on the server, please reopen the PDF.',
  'Chưa chọn file': 'No file selected',
  'PDF có mật khẩu, hãy bỏ mật khẩu trước.': 'The PDF is password-protected, please remove the password first.',
  'Chưa chọn trang nào': 'No pages selected',
  'Chưa cài pdf2docx (pip install pdf2docx)': 'pdf2docx is not installed (pip install pdf2docx)',
  'Chưa chọn file .docx': 'No .docx file selected',
  'Đường dẫn ảnh không hợp lệ': 'Invalid image URL',
  'Ảnh quá lớn (> 25 MB)': 'Image too large (> 25 MB)',
  'Đường dẫn không phải là ảnh': 'The URL is not an image',
  'Không tìm thấy LibreOffice': 'LibreOffice not found',
};

const PATTERNS = [
  ['Trang {#0} / {#1}', 'Page {0} / {1}'],
  ['Trang {#0}', 'Page {0}'],
  ['{#0} trang · đã chọn {#1}', '{0} pages · {1} selected'],
  ['{#0} trang', '{0} pages'],
  ['{0} · {#1} trang', '{0} · {1} pages'],
  ['{#0} trang · {#1} file', '{0} pages · {1} files'],
  ['Đang chọn: {0}', 'Selected: {0}'],
  ['Công cụ: {0}', 'Tool: {0}'],
  ['Hình – {0}', 'Shape – {0}'],
  ['Đang ghép {#0} file PDF…', 'Merging {0} PDF files…'],
  ['Đã ghép {#0} file thành {#1} trang', 'Merged {0} files into {1} pages'],
  ['Không mở được file: {0}', 'Could not open the file: {0}'],
  ['Không ghép được file: {0}', 'Could not merge the files: {0}'],
  ['Đã mở dự án: {#0} đối tượng', 'Project opened: {0} objects'],
  ['Lỗi mở dự án: {0}', 'Error opening project: {0}'],
  ['{0} có trang là ảnh scan (chỉ có hình ảnh, không có chữ thật). {1} Bạn vẫn có thể thêm văn bản, ảnh, hình vẽ, che vùng và chú thích như bình thường.',
    'This PDF has scanned image pages (images only, no real text). {1} You can still add text, images, shapes, cover areas and comments as usual.'],
  ['PDF này là ảnh scan (chỉ có hình ảnh, không có chữ thật). {0} Bạn vẫn có thể thêm văn bản, ảnh, hình vẽ, che vùng và chú thích như bình thường.',
    'This PDF is a scanned image (images only, no real text). {0} You can still add text, images, shapes, cover areas and comments as usual.'],
  ['Trang {#0} là ảnh scan (chỉ có hình ảnh, không có chữ thật). {1} Bạn vẫn có thể thêm văn bản, ảnh, hình vẽ, che vùng và chú thích như bình thường.',
    'Page {0} is a scanned image (images only, no real text). {1} You can still add text, images, shapes, cover areas and comments as usual.'],
  ['Trình duyệt không đọc được ảnh dạng .{0}. Hãy chuyển sang JPG hoặc PNG rồi thử lại.', 'The browser can’t read .{0} images. Convert it to JPG or PNG and try again.'],
  ['Lỗi xuất PDF: {0}', 'PDF export error: {0}'],
  ['Lỗi chuyển Word: {0}', 'Word conversion error: {0}'],
  ['Lỗi tách PDF: {0}', 'PDF split error: {0}'],
  ['Lỗi ghép PDF: {0}', 'PDF merge error: {0}'],
  ['Lỗi: {0}', 'Error: {0}'],
  ['{0} (Ctrl+Z để hoàn tác)', '{0} (Ctrl+Z to undo)'],
  ['Đã xoá {#0} trang', 'Deleted {0} pages'],
  ['Đã xoá {#0} phần (Ctrl+Z để hoàn tác)', 'Removed {0} items (Ctrl+Z to undo)'],
  ['Xoá {#0} phần đã thêm / sửa trên trang {#1}?', 'Remove {0} additions / edits on page {1}?'],
  ['Xoá tất cả {#0} phần đã thêm / sửa trên mọi trang?', 'Remove all {0} additions / edits on every page?'],
  ['Đã thêm {#0} trang từ 1 file', 'Added {0} pages from 1 file'],
  ['Đã nhân bản {#0} trang', 'Duplicated {0} pages'],
  ['Đang tải lên {#0} file…', 'Uploading {0} files…'],
  ['Không đọc được file: {0}', 'Could not read the file: {0}'],
  ['Đã ghép {#0} trang từ {#1} file', 'Merged {0} pages from {1} files'],
  ['Đang trích xuất trang {0}…', 'Extracting pages {0}…'],
  ['Không hiểu "{0}". Ví dụ đúng: 1-3, 5, 7-9', 'Can’t understand "{0}". Valid example: 1-3, 5, 7-9'],
  ['Khoảng "{0}" không hợp lệ (tài liệu có {#1} trang)', 'Range "{0}" is invalid (the document has {1} pages)'],
  ['Đã tách thành {#0} file (ZIP)', 'Split into {0} files (ZIP)'],
  ['Đã tạo {#0} file PDF (trong 1 file ZIP).', 'Created {0} PDF files (in 1 ZIP file).'],
  ['Đã tạo {#0} file PDF.', 'Created {0} PDF file.'],
  ['trang {0}', 'page {0}'],
  ['trang {0} ({#1})', 'pages {0} ({1})'],
  ['Sẽ tạo {#0} file PDF', 'Will create {0} PDF files'],
  ['… và {#0} file nữa', '… and {0} more files'],
  ['Mỗi khoảng tạo thành 1 file. Tài liệu có {#0} trang.', 'Each range becomes 1 file. The document has {0} pages.'],
  ['Đang tách thành {#0} file…', 'Splitting into {0} files…'],
  ['Đã tự cắt cứ mỗi {#0} trang. Bạn vẫn có thể bấm ✂ để chỉnh lại.', 'Automatically cut every {0} pages. You can still click ✂ to adjust.'],
  ['Cắt sau trang {#0}', 'Cut after page {0}'],
  ['trang → 1 file', 'pages → 1 file'],
  ['chèn sau trang {#0}', 'inserted after page {0}'],
  ['Các file ({#0})', 'Files ({0})'],
  ['dùng {#0} · gốc {#1} trang', 'using {0} · original {1} pages'],
  ['Kết quả: {#0} trang', 'Result: {0} pages'],
  ['Đang đọc {#0} file…', 'Reading {0} files…'],
  ['Đã thêm {#0} trang từ {#1} file', 'Added {0} pages from {1} files'],
  ['Đã cập nhật tài liệu: {#0} trang', 'Document updated: {0} pages'],
  ['Đã ghép thành {#0} trang', 'Merged into {0} pages'],
  ['· Hiện tại · tr.{#0}', '· Current · p.{0}'],
  ['· {0} · tr.{#1}', '· {0} · p.{1}'],
  ['Hiện tại · tr.{#0}', 'Current · p.{0}'],
  ['{0} · tr.{#1}', '{0} · p.{1}'],
  ['File không phải PDF hợp lệ: {0}', 'Not a valid PDF file: {0}'],
  ['Trang {#0} không tồn tại', 'Page {0} does not exist'],
  ['Có số trang vượt quá tài liệu ({#0} trang)', 'Some page numbers exceed the document ({0} pages)'],
  ['Không chuyển được DOCX → PDF. Cần cài Microsoft Word hoặc LibreOffice. ({0})', 'Could not convert DOCX → PDF. Microsoft Word or LibreOffice is required. ({0})'],
  ['Không tải được ảnh: {0}', 'Could not download the image: {0}'],
];

/* ------------------------------------------------------------------ dịch */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMPILED = PATTERNS.map(([vi, en]) => {
  const names = [];
  const src = vi.split(/(\{#?\d\})/).map((part) => {
    const m = part.match(/^\{(#?)(\d)\}$/);
    if (!m) return reEsc(part);
    names.push(+m[2]);
    return m[1] ? '(\\d+)' : '(.+?)';
  }).join('');
  return { re: new RegExp('^' + src + '$', 's'), names, en, lit: vi.replace(/\{#?\d\}/g, '').length };
}).sort((a, b) => b.lit - a.lit);

function translate(s, depth = 0) {
  if (!s) return s;
  const core = s.trim();
  if (!core) return s;
  const lead = s.slice(0, s.indexOf(core)), trail = s.slice(s.indexOf(core) + core.length);
  if (EXACT[core] !== undefined) return lead + EXACT[core] + trail;
  if (depth > 4) return s;
  for (const p of COMPILED) {
    const m = core.match(p.re);
    if (!m) continue;
    let out = p.en;
    p.names.forEach((n, i) => { out = out.split('{' + n + '}').join(translate(m[i + 1], depth + 1)); });
    return lead + out + trail;
  }
  return s;
}

const LS_KEY = 'pdfeditor.lang';
let lang = 'vi';
try { lang = localStorage.getItem(LS_KEY) || 'vi'; } catch (_) {}
export const getLang = () => lang;
/** Dịch một chuỗi (dùng cho confirm() và các chỗ không nằm trong trang). */
export function tr(s) { return lang === 'vi' ? s : translate(s); }

/* ------------------------------------------------------------------ dịch DOM tự động */
const ATTRS = ['title', 'placeholder', 'aria-label'];
const orig = new WeakMap(), written = new WeakMap();
function skipText(node) {
  const el = node.parentElement;
  if (!el) return true;
  if (el.closest('script,style,textarea,.textLayer,.content,.hits')) return true;
  if (el.closest('.page') && !el.closest('.page-num')) return true;   // nội dung PDF & chữ người dùng
  return false;
}
function processText(node) {
  if (skipText(node)) return;
  const cur = node.nodeValue;
  if (written.get(node) !== cur) orig.set(node, cur);   // ứng dụng vừa đổi nội dung
  const src = orig.get(node);
  const out = lang === 'vi' ? src : translate(src);
  written.set(node, out);
  if (out !== cur) node.nodeValue = out;
}
function processAttr(el, a) {
  const cur = el.getAttribute(a);
  if (cur == null || (a === 'title' && el.classList && el.classList.contains('hit'))) return;
  const st = el.__i18n || (el.__i18n = {});
  const rec = st[a] || (st[a] = {});
  if (rec.w !== cur) rec.o = cur;
  const out = lang === 'vi' ? rec.o : translate(rec.o);
  rec.w = out;
  if (out !== cur) el.setAttribute(a, out);
}
function walk(root) {
  if (root.nodeType === 3) { processText(root); return; }
  if (root.nodeType !== 1 || root.closest('.textLayer')) return;
  for (const a of ATTRS) if (root.hasAttribute(a)) processAttr(root, a);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && n.classList.contains('textLayer') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) processText(n);
    else for (const a of ATTRS) if (n.hasAttribute(a)) processAttr(n, a);
  }
}
let observer = null;
export function initI18n() {
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') processText(m.target);
      else if (m.type === 'attributes') processAttr(m.target, m.attributeName);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  applyLang();
}
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  walk(document.body);
}
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'vi';
  try { localStorage.setItem(LS_KEY, lang); } catch (_) {}
  applyLang();
}
