import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { GameType } from './types';

// Inform TypeScript about the global variables from the CDN scripts
declare const mammoth: any;
declare const pdfjsLib: any;
declare const JSZip: any;


// Khởi tạo Google AI Client
// API Key được giả định đã được cấu hình trong biến môi trường process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

/**
 * Thành phần chính của ứng dụng Trợ Lý Sáng Tạo Game Giáo Dục.
 * Chịu trách nhiệm hiển thị giao diện và xử lý logic tạo game.
 */
const App: React.FC = () => {
  // === TRẠNG THÁI (STATE) CỦA ỨNG DỤNG ===
  const [subject, setSubject] = useState<string>('Lịch sử');
  const [gameType, setGameType] = useState<GameType>(GameType.Quiz);
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(5);
  const [lessonContent, setLessonContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Đang xử lý...');
  const [error, setError] = useState<string>('');
  const [generatedGame, setGeneratedGame] = useState<{ title: string; htmlContent: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copyButtonText, setCopyButtonText] = useState<string>('Sao chép mã');

  // Ref để truy cập input file ẩn
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === ICONS CHO CÁC LOẠI GAME ===
  const gameIcons: Record<GameType, React.ReactNode> = {
    [GameType.Quiz]: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    [GameType.FillInTheBlanks]: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
    [GameType.Matching]: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h2m12 0h2M4 12h2m12 0h2M4 18h2m12 0h2M8 9.75h4.5m-4.5 4.5h4.5m5.25-8.25L12 15" />
      </svg>
    ),
    [GameType.Sequencing]: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
    ),
  };

  // === CÁC HÀM XỬ LÝ TỆP ===

  /** Đọc tệp dưới dạng ArrayBuffer */
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Không thể đọc tệp.'));
      reader.readAsArrayBuffer(file);
    });
  };
  
  /** Đọc tệp văn bản (.txt) */
  const readTxtFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Không thể đọc tệp văn bản.'));
        reader.readAsText(file);
    });
  };

  /** Đọc tệp Word (.docx) */
  const readDocxFile = async (file: File): Promise<string> => {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  /** Đọc tệp PDF (.pdf) */
  const readPdfFile = async (file: File): Promise<string> => {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('Thư viện PDF chưa được tải. Vui lòng kiểm tra lại kết nối mạng.');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    return fullText;
  };

  /** Đọc tệp PowerPoint (.pptx) */
  const readPptxFile = async (file: File): Promise<string> => {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slidePromises: Promise<string>[] = [];
    
    // Tìm tất cả các tệp slide XML
    zip.folder("ppt/slides")?.forEach((relativePath, fileEntry) => {
        if (relativePath.startsWith("slide") && relativePath.endsWith(".xml")) {
             slidePromises.push(fileEntry.async("string"));
        }
    });

    const slideXmls = await Promise.all(slidePromises);
    let fullText = '';
    const parser = new DOMParser();

    slideXmls.forEach((xmlString, index) => {
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const textNodes = xmlDoc.getElementsByTagName("a:t");
        let slideText = `--- Slide ${index + 1} ---\n`;
        for (let i = 0; i < textNodes.length; i++) {
            slideText += textNodes[i].textContent + " ";
        }
        fullText += slideText.trim() + '\n\n';
    });
    return fullText.trim();
  };

  /**
   * Xử lý sự kiện khi người dùng chọn một tệp để tải lên.
   * Đọc nội dung tệp và cập nhật vào state.
   */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadingMessage('Đang đọc tệp...');
    setError('');
    setLessonContent('');
    setGeneratedGame(null);

    try {
        const extension = file.name.split('.').pop()?.toLowerCase();
        let text = '';

        switch (extension) {
            case 'txt':
                text = await readTxtFile(file);
                break;
            case 'docx':
                text = await readDocxFile(file);
                break;
            case 'pdf':
                text = await readPdfFile(file);
                break;
            case 'pptx':
                text = await readPptxFile(file);
                break;
            default:
                throw new Error(`Định dạng tệp .${extension} không được hỗ trợ.`);
        }
        setLessonContent(text);
    } catch (err: any) {
        setError(err.message || 'Không thể xử lý tệp. Vui lòng thử một tệp khác.');
    } finally {
        setIsLoading(false);
        if (event.target) {
            event.target.value = ''; // Cho phép tải lại cùng một tệp
        }
    }
  };

  /**
   * Kích hoạt cửa sổ chọn tệp khi người dùng nhấp vào nút "Tải lên tệp".
   */
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  /**
   * Xử lý việc sao chép mã HTML vào clipboard.
   */
  const handleCopyCode = () => {
    if (generatedGame?.htmlContent) {
      navigator.clipboard.writeText(generatedGame.htmlContent).then(() => {
        setCopyButtonText('Đã sao chép!');
        setTimeout(() => setCopyButtonText('Sao chép mã'), 2000);
      }).catch(err => {
        console.error('Lỗi khi sao chép: ', err);
        setCopyButtonText('Lỗi!');
         setTimeout(() => setCopyButtonText('Sao chép mã'), 2000);
      });
    }
  };

  /**
   * Tạo prompt chi tiết gửi đến AI dựa trên lựa chọn của người dùng.
   * @returns {string} - Chuỗi prompt hoàn chỉnh.
   */
  const createPrompt = (): string => {
    const gameTypeDescription = {
      [GameType.Quiz]: `trò chơi trắc nghiệm gồm ${numberOfQuestions} câu hỏi. Mỗi câu hỏi có 4 lựa chọn và chỉ một đáp án đúng.`,
      [GameType.FillInTheBlanks]: `trò chơi điền từ vào chỗ trống. Tạo ra một đoạn văn bản phù hợp, trong đó có ${numberOfQuestions} từ khóa quan trọng bị ẩn đi để học sinh điền vào.`,
      [GameType.Matching]: `trò chơi nối cột. Tạo ${numberOfQuestions} cặp thông tin liên quan (cột A và cột B) để học sinh ghép nối.`,
      [GameType.Sequencing]: `trò chơi sắp xếp. Tạo một danh sách ${numberOfQuestions} sự kiện hoặc quy trình không theo thứ tự để học sinh sắp xếp lại cho đúng.`,
    };

    return `Bạn là một chuyên gia thiết kế game giáo dục sáng tạo. Dựa vào nội dung bài học sau đây về chủ đề "${subject}", hãy tạo ra một ${gameTypeDescription[gameType]}

Nội dung bài học:
---
${lessonContent}
---

YÊU CẦU ĐẦU RA BẮT BUỘC:
1.  **Định dạng**: Chỉ trả về một đối tượng JSON hợp lệ, không có bất kỳ văn bản nào khác bên ngoài JSON.
2.  **Cấu trúc JSON**: Đối tượng JSON phải tuân thủ nghiêm ngặt schema sau.
3.  **Nội dung HTML ("htmlContent")**:
    *   Phải là một chuỗi HTML duy nhất, hoàn chỉnh và **tự chứa (self-contained)**. Toàn bộ game (HTML, CSS, JS) phải nằm trong chuỗi này.
    *   **KHÔNG** được bao gồm các thẻ \`<html>\`, \`<head>\`, hoặc \`<body>\`. Chỉ chứa mã cho phần thân của game.
    *   **CSS nhúng**: Phải nhúng một thẻ \`<style>\` ngay đầu chuỗi HTML. Thẻ style này phải chứa TẤT CẢ các quy tắc CSS cần thiết để định dạng toàn bộ game, đảm bảo nó có thể hiển thị đẹp mắt một cách độc lập.
        *   **Phong cách chung**: Sử dụng phong cách UI/UX hiện đại, sạch sẽ, phù hợp với giáo dục.
        *   **Bảng màu**: Ưu tiên sử dụng các màu pastel tươi sáng và hài hòa. Ví dụ: nền chính \`#FFFBF5\`, tiêu đề \`#4A4A4A\`, nút bấm \`#FFDAB9\` (peach), hover \`#FEC89A\`. Phản hồi đúng \`#D4EDDA\`, phản hồi sai \`#F8D7DA\`.
        *   **Bo góc**: Các thành phần (container, nút, ô nhập liệu) phải có bo góc mềm mại (ví dụ: \`border-radius: 8px\` hoặc \`12px\`).
        *   **Font chữ**: Sử dụng một font chữ sans-serif dễ đọc (ví dụ: 'Arial', 'Helvetica', font hệ thống).
        *   **Định dạng chi tiết**: Phải định dạng rõ ràng cho tiêu đề game, câu hỏi, các nút trả lời/lựa chọn (với các trạng thái hover, selected, correct, incorrect), vùng nhập liệu (nếu có), thông báo phản hồi, và nút 'Kiểm tra'/'Tiếp theo'.
    *   **JavaScript nhúng**:
        *   Phải nhúng TẤT CẢ JavaScript cần thiết vào trong một thẻ \`<script>\` ở cuối chuỗi HTML.
        *   Chỉ sử dụng **JavaScript thuần túy (vanilla JS)**, không dùng bất kỳ thư viện hay framework nào.
        *   JavaScript này phải xử lý **toàn bộ logic tương tác** của game, bao gồm:
            *   Xử lý sự kiện khi người dùng chọn đáp án.
            *   Kiểm tra câu trả lời là đúng hay sai.
            *   Hiển thị phản hồi ngay lập tức cho người dùng (ví dụ: đổi màu đáp án, hiển thị thông báo).
            *   Tính điểm (nếu có).
            *   Cho phép chuyển sang câu hỏi tiếp theo hoặc hoàn thành game.
`;
  };

  /**
   * Hàm chính để gọi API của Google AI và tạo game.
   */
  const handleGenerateGame = async () => {
    if (!lessonContent.trim()) {
      setError('Vui lòng nhập nội dung bài học hoặc tải lên một tệp.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('AI đang sáng tạo...');
    setError('');
    setGeneratedGame(null);

    try {
      const prompt = createPrompt();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Tiêu đề sáng tạo cho trò chơi.' },
              htmlContent: { type: Type.STRING, description: 'Chuỗi HTML tự chứa của trò chơi tương tác.' }
            },
            required: ["title", "htmlContent"],
          },
        },
      });

      // Trích xuất và phân tích chuỗi JSON từ phản hồi
      const jsonString = response.text;
      const parsedResponse = JSON.parse(jsonString);

      setGeneratedGame(parsedResponse);

    } catch (e: any) {
      console.error(e);
      setError(`Đã xảy ra lỗi khi tạo game. Vui lòng thử lại. Lỗi: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // === RENDER GIAO DIỆN ===
  return (
    <div className="min-h-screen bg-orange-50 text-gray-800 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Thông tin giáo viên */}
        <div className="bg-amber-50 p-4 rounded-xl shadow-sm mb-8 border border-amber-200">
            <div className="flex items-start sm:items-center justify-between flex-wrap gap-4">
                {/* Left Side: Teacher Info */}
                <div className="flex items-start gap-4">
                    <span className="text-3xl pt-1">👩‍🏫</span>
                    <div>
                        <p className="font-semibold text-gray-800">Trần Thị Dương Thanh</p>
                        <p className="font-semibold text-gray-800">Hồ Thị Minh Tình</p>
                        <p className="font-semibold text-gray-800">Đinh Lê Ngọc Oanh</p>
                    </div>
                </div>

                {/* Right Side: School Info */}
                <div className="flex items-center gap-3 text-amber-800 shrink-0">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                     </svg>
                    <p className="font-semibold">Trường THPT Sơn Trà</p>
                </div>
            </div>
        </div>


        {/* Tiêu đề ứng dụng */}
        <header className="text-center mb-12">
           <div className="flex items-center justify-center gap-4 mb-3">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
              Trợ Lý Sáng Tạo Game Giáo Dục
            </h1>
          </div>
          <p className="mt-2 text-lg text-gray-600 max-w-3xl mx-auto">
            Biến nội dung bài giảng thành trò chơi tương tác hấp dẫn chỉ trong vài giây với sự trợ giúp của Trí tuệ Nhân tạo.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* CỘT BÊN TRÁI: KHU VỰC NHẬP LIỆU VÀ ĐIỀU KHIỂN */}
          <div className="bg-white p-6 rounded-3xl shadow-md border border-orange-100">
            <h2 className="text-2xl font-bold mb-5 text-gray-800">1. Nhập thông tin</h2>
            <div className="space-y-6">
              {/* Nhập môn học/chủ đề */}
              <div>
                <label htmlFor="subject" className="block text-md font-medium text-gray-700 mb-2">Chủ đề / Môn học</label>
                <input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ví dụ: Lịch sử Việt Nam, Địa lý thiên nhiên, Kinh tế vĩ mô..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 transition"
                />
              </div>

              {/* Chọn loại game */}
              <div>
                <label className="block text-md font-medium text-gray-700 mb-3">Loại trò chơi</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.values(GameType).map((gt) => (
                    <label
                      key={gt}
                      className={`flex flex-col items-center justify-center text-center p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                        gameType === gt
                          ? 'bg-red-100 border-red-500 ring-2 ring-red-300 shadow-lg'
                          : 'bg-white border-gray-300 hover:border-red-400 hover:shadow-md'
                      }`}
                    >
                      <input
                        type="radio"
                        name="gameType"
                        value={gt}
                        checked={gameType === gt}
                        onChange={() => setGameType(gt)}
                        className="sr-only"
                      />
                      {gameIcons[gt]}
                      <span className={`font-semibold text-sm ${gameType === gt ? 'text-red-800' : 'text-gray-700'}`}>{gt}</span>
                    </label>
                  ))}
                </div>
              </div>

               {/* Nhập số lượng câu hỏi */}
              <div>
                <label htmlFor="numberOfQuestions" className="block text-md font-medium text-gray-700 mb-2">Số lượng câu hỏi/mục</label>
                <input
                  type="number"
                  id="numberOfQuestions"
                  value={numberOfQuestions}
                  onChange={(e) => setNumberOfQuestions(Number(e.target.value))}
                  min="3"
                  max="20"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 transition"
                />
              </div>

              {/* Nhập nội dung bài học */}
              <div>
                <label htmlFor="lessonContent" className="block text-md font-medium text-gray-700 mb-2">
                  Nội dung bài học
                </label>
                <textarea
                  id="lessonContent"
                  rows={10}
                  value={lessonContent}
                  onChange={(e) => setLessonContent(e.target.value)}
                  placeholder="Dán nội dung bài học vào đây hoặc tải lên tệp để tự động trích xuất nội dung..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 transition"
                ></textarea>
              </div>

              {/* Tải lên tệp */}
              <div className="text-center">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".txt,.pdf,.docx,.pptx"
                />
                <button
                  onClick={triggerFileSelect}
                  disabled={isLoading}
                  className="w-full p-3 bg-amber-100 text-amber-800 font-semibold rounded-lg border-2 border-dashed border-amber-300 hover:bg-amber-200 hover:border-amber-400 transition disabled:opacity-50 disabled:cursor-wait"
                >
                  Tải lên tệp (.txt, .docx, .pdf, .pptx)
                </button>
              </div>

              {/* Nút tạo game */}
              <button
                onClick={handleGenerateGame}
                disabled={isLoading}
                className="w-full p-4 bg-red-400 text-white font-bold text-lg rounded-lg hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:bg-red-200 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {loadingMessage}
                  </>
                ) : '✨ Tạo Game Ngay'}
              </button>
            </div>
          </div>

          {/* CỘT BÊN PHẢI: KHU VỰC HIỂN THỊ KẾT QUẢ */}
          <div className="bg-white p-6 rounded-3xl shadow-md border border-orange-100 min-h-[500px] flex flex-col">
            <h2 className="text-2xl font-bold mb-5 text-gray-800">2. Kết quả</h2>
            <div className="flex-grow flex flex-col bg-orange-50 border border-orange-200 rounded-lg p-1">
              {/* Hiển thị lỗi nếu có */}
              {error && <div className="p-4 m-1 bg-red-100 text-red-700 rounded-lg">{error}</div>}

              {/* Hiển thị kết quả hoặc placeholder */}
              {!isLoading && !generatedGame && !error && (
                 <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500 p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10m-5 5a8 8 0 0111.314 0c2 1 2.5 3.5 2.5 3.5S18 18 16 17c-2-1-2.5-3-2.5-3" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.001 12m-2.122 4.121A3 3 0 009.879 16.12z" />
                  </svg>
                   <h3 className="text-lg font-semibold">Trò chơi của bạn sẽ xuất hiện ở đây</h3>
                   <p className="max-w-xs">Hoàn thành các thông tin bên trái và nhấn "Tạo Game Ngay" để bắt đầu.</p>
                 </div>
              )}
              {isLoading && (
                 <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500 p-4">
                  <svg className="animate-spin h-12 w-12 text-red-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                   <h3 className="text-lg font-semibold text-gray-700">{loadingMessage}</h3>
                   <p className="max-w-xs">Vui lòng chờ trong giây lát.</p>
                 </div>
              )}
              {generatedGame && (
                <div className="flex flex-col h-full">
                  {/* Tabs chuyển đổi */}
                  <div className="flex border-b border-orange-200 bg-white rounded-t-md">
                    <button onClick={() => setActiveTab('preview')} className={`px-4 py-3 font-semibold transition-colors ${activeTab === 'preview' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500 hover:text-red-400'}`}>Xem trước</button>
                    <button onClick={() => setActiveTab('code')} className={`px-4 py-3 font-semibold transition-colors ${activeTab === 'code' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500 hover:text-red-400'}`}>Mã HTML</button>
                  </div>
                  {/* Nội dung tabs */}
                  <div className="flex-grow p-4 bg-white rounded-b-md overflow-auto">
                    {activeTab === 'preview' ? (
                      <div>
                        <h3 className="text-xl font-bold mb-4">{generatedGame.title}</h3>
                        <div
                          className="border border-gray-200 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: generatedGame.htmlContent }}
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <button onClick={handleCopyCode} className="absolute top-2 right-2 bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded hover:bg-gray-800 transition">{copyButtonText}</button>
                        <pre className="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto">
                          <code className="text-sm font-mono whitespace-pre-wrap">{generatedGame.htmlContent}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
        
        <footer className="text-center mt-12 py-6 border-t border-orange-200">
            <div className="flex items-center justify-center gap-6 text-gray-600">
                <span className="flex items-center gap-2">
                    <span className="text-xl">📞</span>
                    <span>Điện thoại: 0986645406</span>
                </span>
                <span className="flex items-center gap-2">
                    <span className="text-xl">💬</span>
                    <span>Facebook: Dương Thanh</span>
                </span>
            </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
