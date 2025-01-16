import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import config from './config';

const loadConfig = async () => {
  try {
    const response = await axios.get('/config.json');
    return response.data;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
};

const { ipAddress } = await loadConfig();

const { port, http } = config;

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [recognition, setRecognition] = useState(null);
  const [logs, setLogs] = useState([]); // 로그 메시지를 저장할 상태
  const logsEndRef = useRef(null); // 로그 끝 부분을 참조하는 ref

  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const fetchTextFromServer = useCallback(async () => {
    try {
      addLog('Fetching text from server');
      const result = await axios.get(`${http}://${ipAddress}:${port}/get-text`);
      addLog(`Fetched text: ${result.data.text}`);
      setText(result.data.text);
    } catch (error) {
      addLog(`Error fetching text: ${error}`);
      console.error('Error fetching text:', error);
    }
  }, []);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recog = new window.webkitSpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'ko-KR';

      recog.onresult = async (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        setText((prevText) => prevText + finalTranscript);
        setInterimText(interimTranscript);

        // 실시간으로 텍스트를 서버에 저장
        addLog(`Saving text to server: ${finalTranscript}`);
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
          text: finalTranscript,
        });

        // 서버에서 텍스트를 가져옴
        fetchTextFromServer();
      };

      recog.onend = async () => {
        addLog(`Recognition ended, saving text to server: ${text}`);
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, { text });

        // 서버에서 텍스트를 가져옴
        fetchTextFromServer();
      };

      setRecognition(recog);
    } else {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
  }, [isListening, text, fetchTextFromServer]);

  const handleListen = () => {
    if (recognition) {
      if (isListening) {
        addLog('Stopping recognition');
        recognition.stop();
      } else {
        addLog('Starting recognition');
        recognition.start();
      }
      setIsListening(!isListening);
    }
  };

  useEffect(() => {
    // 초기 로드 시 서버에서 텍스트를 가져옴
    fetchTextFromServer();
  }, [fetchTextFromServer]);

  useEffect(() => {
    // 로그가 업데이트될 때마다 스크롤을 하단으로 이동
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <Router>
      <div
        style={{
          textAlign: 'center',
          marginTop: '50px',
          backgroundColor: 'transparent',
        }}
      >
        <button onClick={handleListen}>{isListening ? '중지' : '시작'}</button>
        <p style={{ whiteSpace: 'pre-line' }}>
          {text} <span style={{ color: 'gray' }}>{interimText}</span>
        </p>
        <Routes>
          <Route
            path="/debug"
            element={
              <div
                style={{
                  textAlign: 'left',
                  marginTop: '20px',
                  maxHeight: '200px',
                  overflowY: 'scroll',
                  backgroundColor: '#f0f0f0',
                  padding: '10px',
                }}
              >
                <h2>Logs</h2>
                {logs.map((log, index) => (
                  <p key={index}>{log}</p>
                ))}
                <div ref={logsEndRef} />
              </div>
            }
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
