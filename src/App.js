import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import io from 'socket.io-client';
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

const socket = io(`${http}://${ipAddress}:${port}`);

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [recognition, setRecognition] = useState(null);
  const [logs, setLogs] = useState([]); // 로그 메시지를 저장할 상태
  const logsEndRef = useRef(null); // 로그 끝 부분을 참조하는 ref
  const textEndRef = useRef(null); // 텍스트 끝 부분을 참조하는 ref

  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const fetchTextFromServer = useCallback(async () => {
    try {
      addLog('Fetching text from server');
      const result = await axios.get(`${http}://${ipAddress}:${port}/get-text`);
      addLog(`Fetched text: ${result.data.text}`);
      setText(result.data.text);
      setInterimText(result.data.interimText);
    } catch (error) {
      addLog(`Error fetching text: ${error}`);
      console.error('Error fetching text:', error);
    }
  }, []);

  useEffect(() => {
    socket.on('new-text', ({ text, interimText }) => {
      setText(text);
      setInterimText(interimText);
    });

    socket.on('new-interim-text', (newInterimText) => {
      setInterimText(newInterimText);
    });

    return () => {
      socket.off('new-text');
      socket.off('new-interim-text');
    };
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
        setText((prevText) => prevText + ' ' + finalTranscript);
        setInterimText(interimTranscript);

        addLog(`Saving text to server: ${finalTranscript}`);
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
          text: finalTranscript,
        });

        await axios.post(`${http}://${ipAddress}:${port}/save-interim-text`, {
          interimText,
        });
      };

      recog.onend = async () => {
        // onend 이벤트 내에서 최신 상태에 접근이 필요하다면 useRef를 고려하세요.
        if (isListening) {
          addLog(`Recognition ended, saving text to server: ${text}`);
          await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
            text,
          });
        }
      };

      setRecognition(recog);
    } else {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 의존성 배열을 빈 배열로 수정!

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

  useEffect(() => {
    // 텍스트가 업데이트될 때마다 스크롤을 하단으로 이동
    if (textEndRef.current) {
      textEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [text, interimText]);

  return (
    <Router>
      <div
        style={{
          textAlign: 'center',
          marginTop: '50px',
          backgroundColor: 'transparent',
        }}
      >
        <button onClick={handleListen} className="ats-start">
          {isListening ? '중지' : '시작'}
        </button>
        <div
          style={{
            position: 'fixed',
            bottom: '42px',
            textAlign: 'left',
            padding: '10px',
            height: '4em',
            overflowY: 'auto',
            backgroundColor: 'rgba(0,0,0,0.8)',
          }}
          className="memo-box"
        >
          <p style={{ whiteSpace: 'pre-line', margin: 0 }}>
            <span
              style={{
                color: 'white',
                display: 'inline',
              }}
            >
              {text} <span style={{ color: 'white' }}>{interimText}</span>
            </span>
          </p>
          <div ref={textEndRef} />
        </div>
        <Routes>
          <Route path="/" element={<div></div>} />
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
