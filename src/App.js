import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
        setText(finalTranscript);
        setInterimText(interimTranscript);

        // 실시간으로 텍스트를 서버에 저장
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, {
          text: finalTranscript,
        });
      };

      recog.onend = async () => {
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, { text });
      };

      setRecognition(recog);
    } else {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
  }, [isListening, text]);

  const handleListen = () => {
    if (recognition) {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
      setIsListening(!isListening);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await axios.get(
          `${http}://${ipAddress}:${port}/get-text`
        );
        setText(result.data.text);
      } catch (error) {
        console.error('Error fetching text:', error);
      }
    };

    // 주기적으로 서버에서 텍스트를 가져옴 (예: 1초마다)
    const intervalId = setInterval(fetchData, 1000);

    // 컴포넌트 언마운트 시 인터벌 정리
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div
      style={{
        textAlign: 'center',
        marginTop: '50px',
        backgroundColor: 'transparent',
      }}
    >
      <h1>음성을 텍스트로 변환</h1>
      <button onClick={handleListen}>{isListening ? '중지' : '시작'}</button>
      <p>
        {text} <span style={{ color: 'gray' }}>{interimText}</span>
      </p>
    </div>
  );
};

export default App;
