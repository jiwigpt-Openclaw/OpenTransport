; (function ($) {
	var
		win = $(window),
		doc = $(document),
		body,
		timer = {
			scroll: null,
			resize: null,
			scrollEndTime: 250,
			resizeEndTime: 250
		},
		crossSignAnimationCurrentFrame = 0;

	this.incidentMap = {};

	//="{x:0,y:0,stationID:'"&A2&"',stationCode:'"&B2&"',stationName:{en:'"&C2&"','tc':'"&D2&"'}},"

	var mapData = {
		lines: [
			{//must be above airport to make airport line overlap on top
				cssClassName: 'tung-chung',
				id: '07',
				lineCode: 'TCL',
				routes: [
					{ x: 407, y: 471, width: 141, height: 88, relStation: '39,40' },//Hong Kong - Kowloon
					{ x: 407, y: 418, width: 28, height: 56, relStation: '40,41' },//Kowloon - Olympic
					{ x: 407, y: 352, width: 28, height: 66, relStation: '41,53' },//Olympic - Nam Cheong
					{ x: 383, y: 292, width: 51, height: 60, relStation: '53,21' },//Nam Cheong - Lai King
					{ x: 317, y: 292, width: 65, height: 62, relStation: '21,42' },//Lai King - Tsing Yi
					{ x: 264, y: 336, width: 56, height: 65, relStation: '42,54' },//Tsing Yi - Sunny Bay
					{ x: 186, y: 399, width: 78, height: 78, relStation: '54,43' }//Sunny Bay - Tung Chung
				],
				stations: [
					{ x: 515, y: 551, stationID: 'id039', stationCode: 'HOK', stationName: { en: 'Hong Kong Station', tc: '香港站' } },
					{ x: 424, y: 468, stationID: 'id040', stationCode: 'KOW', stationName: { en: 'Kowloon Station', tc: '九龍站' } },
					{ x: 424, y: 411, stationID: 'id041', stationCode: 'OLY', stationName: { en: 'Olympic Station', tc: '奧運站' } },
					{ x: 424, y: 347, stationID: 'id053', stationCode: 'NAC', stationName: { en: 'Nam Cheong Station', tc: '南昌站' } },
					{ x: 379, y: 294, stationID: 'id021', stationCode: 'LAK', stationName: { en: 'Lai King Station', tc: '荔景站' } },
					{ x: 313, y: 331, stationID: 'id042', stationCode: 'TSY', stationName: { en: 'Tsing Yi Station', tc: '青衣站' } },
					{ x: 258, y: 393, stationID: 'id054', stationCode: 'SUN', stationName: { en: 'Sunny Bay Station', tc: '欣澳站' } },
					{ x: 182, y: 470, stationID: 'id043', stationCode: 'TUC', stationName: { en: 'Tung Chung Station', tc: '東涌站' } }
				]
			},
			{
				cssClassName: 'airport',
				id: '08',
				lineCode: 'AEL',
				routes: [
					{ x: 414, y: 469, width: 113, height: 95, relStation: '39,40' },//Hong Kong - Kowloon
					{ x: 321, y: 293, width: 110, height: 180, relStation: '40,42' },//Kowloon - Tsing Yi
					{ x: 153, y: 340, width: 169, height: 125, relStation: '42,47' },//Tsing Yi - Airport
					{ x: 153, y: 377, width: 54, height: 62, relStation: '47,56' }//Airport - AsiaWorld Expo
				],
				stations: [
					{ x: 515, y: 556, stationID: 'id039', stationCode: 'HOK', stationName: { en: 'Hong Kong Station', tc: '香港站' } },
					{ x: 418, y: 468, stationID: 'id040', stationCode: 'KOW', stationName: { en: 'Kowloon Station', tc: '九龍站' } },
					{ x: 317, y: 335, stationID: 'id042', stationCode: 'TSY', stationName: { en: 'Tsing Yi Station', tc: '青衣站' } },
					{ x: 156, y: 432, stationID: 'id047', stationCode: 'AIR', stationName: { en: 'Airport Station', tc: '機場站' } },
					{ x: 191, y: 383, stationID: 'id056', stationCode: 'AWE', stationName: { en: 'AsiaWorld-Expo Station', tc: '博覽館站' } }
				]
			},
			{
				cssClassName: 'disney',
				id: '09',
				lineCode: 'DRL',
				routes: [
					{ x: 263, y: 381, width: 46, height: 63, relStation: '54,55' }//Sunny Bay - Disneyland Resort
				],
				stations: [
					{ x: 262, y: 396, stationID: 'id054', stationCode: 'SUN', stationName: { en: 'Sunny Bay Station', tc: '欣澳站' } },
					{ x: 297, y: 438, stationID: 'id055', stationCode: 'DIS', stationName: { en: 'Disneyland Resort Station', tc: '迪士尼站' } }
				]
			},
			{
				cssClassName: 'hong-kong-island',
				id: '00',
				lineCode: 'ISL',
				routes: [
					{ x: 275, y: 568, width: 63, height: 15, relStation: '123,122' },//Kennedy Town - HKU
					{ x: 338, y: 568, width: 60, height: 15, relStation: '122,121' },//HKU - Sai Ying Pun
					{ x: 398, y: 568, width: 60, height: 15, relStation: '121,26' },//Sai Ying Pun - Sheung Wan
					{ x: 458, y: 568, width: 62, height: 15, relStation: '26,1' },//Sheung Wan - Central
					{ x: 521, y: 568, width: 60, height: 15, relStation: '1,2' },//Central - Admiralty
					{ x: 581, y: 568, width: 88, height: 15, relStation: '2,27' },//Admiralty - Wan Chai
					{ x: 669, y: 568, width: 56, height: 15, relStation: '27,28' },//Wan Chai - Causeway Bay
					{ x: 725, y: 568, width: 56, height: 15, relStation: '28,29' },//Causeway Bay - Tin Hau
					{ x: 781, y: 568, width: 56, height: 15, relStation: '29,30' },//Tin Hau - Fortress Hill
					{ x: 837, y: 568, width: 56, height: 15, relStation: '30,31' },//Fortress Hill - North Point
					{ x: 893, y: 568, width: 58, height: 15, relStation: '31,32' },//North Point - Quarry Bay
					{ x: 951, y: 568, width: 63, height: 15, relStation: '32,33' },//Quarry Bay - Tai Koo
					{ x: 1014, y: 568, width: 60, height: 15, relStation: '33,34' },//Tai Koo - Sai Wan Ho
					{ x: 1073, y: 568, width: 67, height: 51, relStation: '34,35' },//Sai Wan Ho - Shau Kei Wan
					{ x: 1121, y: 620, width: 40, height: 55, relStation: '35,36' },//Shau Kei Wan - Heng Fa Chuen
					{ x: 1140, y: 675, width: 26, height: 47, relStation: '36,37' }//Heng Fa Chuen - Chai Wan
				],
				stations: [
					{ x: 273, y: 572, stationID: 'id123', stationCode: 'KET', stationName: { en: 'Kennedy Town Station', tc: '堅尼地城站' } },
					{ x: 333, y: 572, stationID: 'id122', stationCode: 'HKU', stationName: { en: 'HKU Station', tc: '香港大學站' } },
					{ x: 394, y: 572, stationID: 'id121', stationCode: 'SYP', stationName: { en: 'Sai Ying Pun Station', tc: '西營盤站' } },
					{ x: 455, y: 572, stationID: 'id026', stationCode: 'SHW', stationName: { en: 'Sheung Wan Station', tc: '上環站' } },
					{ x: 515, y: 572, stationID: 'id001', stationCode: 'CEN', stationName: { en: 'Central Station', tc: '中環站' } },
					{ x: 575, y: 572, stationID: 'id002', stationCode: 'ADM', stationName: { en: 'Admiralty Station', tc: '金鐘站' } },
					{ x: 665, y: 572, stationID: 'id027', stationCode: 'WAC', stationName: { en: 'Wan Chai Station', tc: '灣仔站' } },
					{ x: 720, y: 572, stationID: 'id028', stationCode: 'CAB', stationName: { en: 'Causeway Bay Station', tc: '銅鑼灣站' } },
					{ x: 777, y: 572, stationID: 'id029', stationCode: 'TIH', stationName: { en: 'Tin Hau Station', tc: '天后站' } },
					{ x: 833, y: 572, stationID: 'id030', stationCode: 'FOH', stationName: { en: 'Fortress Hill Station', tc: '炮台山站' } },
					{ x: 889, y: 572, stationID: 'id031', stationCode: 'NOP', stationName: { en: 'North Point Station', tc: '北角站' } },
					{ x: 946, y: 572, stationID: 'id032', stationCode: 'QUB', stationName: { en: 'Quarry Bay Station', tc: '鰂魚涌站' } },
					{ x: 1008, y: 572, stationID: 'id033', stationCode: 'TAK', stationName: { en: 'Tai Koo Station', tc: '太古站' } },
					{ x: 1070, y: 572, stationID: 'id034', stationCode: 'SWH', stationName: { en: 'Sai Wan Ho Station', tc: '西灣河站' } },
					{ x: 1126, y: 614, stationID: 'id035', stationCode: 'SKW', stationName: { en: 'Shau Kei Wan Station', tc: '筲箕灣站' } },
					{ x: 1151, y: 669, stationID: 'id036', stationCode: 'HFC', stationName: { en: 'Heng Fa Chuen Station', tc: '杏花邨站' } },
					{ x: 1151, y: 717, stationID: 'id037', stationCode: 'CHW', stationName: { en: 'Chai Wan Station', tc: '柴灣站' } }
				]
			},
			{
				cssClassName: 'south-island',
				id: '10',
				lineCode: 'SIL',
				routes: [
					{ x: 579, y: 584, width: 35, height: 47, relStation: '2,126' },//Admiralty - Ocean Park
					{ x: 519, y: 629, width: 95, height: 30, relStation: '126,127' },//Ocean Park - Wong Chuk Hang
					{ x: 420, y: 645, width: 100, height: 60, relStation: '127,128' },//Wong Chuk Hang - Lei Tung
					{ x: 342, y: 691, width: 80, height: 9, relStation: '128,129' }//Lei Tung - South Horizons
				],
				stations: [
					{ x: 575, y: 583, stationID: 'id002', stationCode: 'ADM', stationName: { en: 'Admiralty Station', tc: '金鐘站' } },
					{ x: 605, y: 624, stationID: 'id126', stationCode: 'OCP', stationName: { en: 'Ocean Park', tc: '海洋公園站' } },
					{ x: 516, y: 648, stationID: 'id127', stationCode: 'WCH', stationName: { en: 'Wong Chuk Hang', tc: '黃竹坑站' } },
					{ x: 418, y: 690, stationID: 'id128', stationCode: 'LET', stationName: { en: 'Lei Tung', tc: '利東站' } },
					{ x: 343, y: 690, stationID: 'id129', stationCode: 'SOH', stationName: { en: 'South Horizons', tc: '海怡半島站' } }
				]
			},
			{
				cssClassName: 'kwun-tong',
				id: '02',
				lineCode: 'KTL',
				routes: [
					{ x: 616, y: 367, width: 15, height: 40, relStation: '5,6' },//Yai Ma Tei - Mong Kok
					{ x: 616, y: 328, width: 15, height: 40, relStation: '6,16' },//Mong Kok - Prince Edward
					{ x: 616, y: 288, width: 37, height: 41, relStation: '16,7' },//Prince Edward - Shek Kip Mei
					{ x: 653, y: 288, width: 66, height: 11, relStation: '7,8' },//Shek Kip Mei - Kowloon Tong
					{ x: 719, y: 288, width: 44, height: 11, relStation: '8,9' },//Kowloon Tong - Lok Fu
					{ x: 763, y: 288, width: 47, height: 11, relStation: '9,10' },//Lok Fu - Wong Tai Sin
					{ x: 810, y: 288, width: 80, height: 11, relStation: '10,11' },//Wong Tai Sin - Diamond Hill
					{ x: 890, y: 288, width: 42, height: 11, relStation: '11,12' },//Diamond Hill - Choi Hung
					{ x: 932, y: 288, width: 40, height: 41, relStation: '12,13' },//Choi Hung - Kowloon Bay
					{ x: 963, y: 302, width: 23, height: 34, relStation: '13,14' },//Kowloon Bay - Ngau Tau Kok
					{ x: 970, y: 333, width: 18, height: 42, relStation: '14,15' },//Ngau Tau Kok - Kwun Tong
					{ x: 970, y: 375, width: 18, height: 40, relStation: '15,38' },//Kwun Tong - Lam Tin
					{ x: 970, y: 416, width: 40, height: 38, relStation: '38,48' },//Lam Tin - Yau Tong
					{ x: 1009, y: 440, width: 57, height: 15, relStation: '48,49' },//Yau Tong - Tiu Keng Leng
					{ x: 620, y: 407, width: 132, height: 28, relStation: '5,124' },//Yai Ma Tei - Ho Man Tin
					{ x: 751, y: 427, width: 42, height: 30, relStation: '124,125' }//Ho Man Tin - Whampoa
				],
				stations: [
					{ x: 618, y: 402, stationID: 'id005', stationCode: 'YMT', stationName: { en: 'Yau Ma Tei Station', tc: '油麻地站' } },
					{ x: 618, y: 363, stationID: 'id006', stationCode: 'MOK', stationName: { en: 'Mong Kok Station', tc: '旺角站' } },
					{ x: 618, y: 323, stationID: 'id016', stationCode: 'PRE', stationName: { en: 'Prince Edward Station', tc: '太子站' } },
					{ x: 650, y: 288, stationID: 'id007', stationCode: 'SKM', stationName: { en: 'Shek Kip Mei Station', tc: '石硤尾站' } },
					{ x: 715, y: 288, stationID: 'id008', stationCode: 'KOT', stationName: { en: 'Kowloon Tong Station', tc: '九龍塘站' } },
					{ x: 759, y: 288, stationID: 'id009', stationCode: 'LOF', stationName: { en: 'Lok Fu Station', tc: '樂富站' } },
					{ x: 806, y: 288, stationID: 'id010', stationCode: 'WTS', stationName: { en: 'Wong Tai Sin Station', tc: '黃大仙站' } },
					{ x: 887, y: 288, stationID: 'id011', stationCode: 'DIH', stationName: { en: 'Diamond Hill Station', tc: '鑽石山站' } },
					{ x: 928, y: 288, stationID: 'id012', stationCode: 'CHH', stationName: { en: 'Choi Hung Station', tc: '彩虹站' } },
					{ x: 967, y: 297, stationID: 'id013', stationCode: 'KOB', stationName: { en: 'Kowloon Bay Station', tc: '九龍灣站' } },
					{ x: 975, y: 330, stationID: 'id014', stationCode: 'NTK', stationName: { en: 'Ngau Tau Kok Station', tc: '牛頭角站' } },
					{ x: 975, y: 370, stationID: 'id015', stationCode: 'KWT', stationName: { en: 'Kwun Tong Station', tc: '觀塘站' } },
					{ x: 975, y: 410, stationID: 'id038', stationCode: 'LAT', stationName: { en: 'Lam Tin Station', tc: '藍田站' } },
					{ x: 1005, y: 442, stationID: 'id048', stationCode: 'YAT', stationName: { en: 'Yau Tong Station', tc: '油塘站' } },
					{ x: 1063, y: 442, stationID: 'id049', stationCode: 'TIK', stationName: { en: 'Tiu Keng Leng Station', tc: '調景嶺站' } },
					{ x: 746, y: 426, stationID: 'id124', stationCode: 'HOM', stationName: { en: 'Ho Man Tin Station', tc: '何文田站' } },
					{ x: 787, y: 449, stationID: 'id125', stationCode: 'WHA', stationName: { en: 'Whampoa Station', tc: '黃埔站' } }

				]
			},
			{
				cssClassName: 'tuen-ma',
				id: '05',
				lineCode: 'TML',
				routes: [
					{ x: 634, y: 479, width: 66, height: 29, relStation: '64,80' },//Hung Hom - East Tsim Sha Tsui
					{ x: 541, y: 471, width: 95, height: 37, relStation: '80,111' },//East Tsim Sha Tsui - Austin
					{ x: 431, y: 353, width: 112, height: 122, relStation: '111,53' },//Austin - Nam Cheong
					{ x: 428, y: 291, width: 20, height: 60, relStation: '53,20' },//Nam Cheong - Mei Foo
					{ x: 153, y: 241, width: 289, height: 51, relStation: '20,114' },//Mei Foo - Tsuen Wan West
					{ x: 116, y: 196, width: 36, height: 57, relStation: '114,115' },//Tsuen Wan West - Kam Sheung Road
					{ x: 116, y: 155, width: 36, height: 42, relStation: '115,116' },//Kam Sheung Road - Yuen Long
					{ x: 116, y: 114, width: 36, height: 42, relStation: '116,117' },//Yuen Long - Long Ping
					{ x: 104, y: 62, width: 48, height: 52, relStation: '117,118' },//Long Ping - Tin Shui Wai
					{ x: 74, y: 62, width: 30, height: 92, relStation: '118,119' },//Tin Shui Wai - Siu Hong
					{ x: 75, y: 154, width: 15, height: 62, relStation: '119,120' },//Siu Hong - Tuen Mun

					{ x: 697, y: 433, width: 55, height: 48, relStation: '124,64' },//Ho Man Tin Station - Hung Hom
					{ x: 751, y: 405, width: 86, height: 36, relStation: '130,124' },//To Kwa Wan Station - Ho Man Tin Station
					{ x: 836, y: 371, width: 37, height: 37, relStation: '131,130' },//Sung Wong Toi Station - To Kwa Wan Station
					{ x: 869, y: 333, width: 28, height: 41, relStation: '132,131' },//Kai Tak Station - Sung Wong Toi Station
					{ x: 888, y: 298, width: 9, height: 36, relStation: '11,132' },//Diamond Hill Station - Kai Tak Station
					{ x: 824, y: 238, width: 72, height: 57, relStation: '133,11' },//Hin Keng Station - Diamond Hill Station
					{ x: 717, y: 227, width: 105, height: 45, relStation: '67,133' },//Tai Wai Station - Hin Keng Station

					{ x: 719, y: 185, width: 99, height: 45, relStation: '67,96' },//Tai Wai - Che Kung Temple
					{ x: 802, y: 141, width: 16, height: 45, relStation: '96,97' },//Che Kung Temple - Sha Tin Wai
					{ x: 802, y: 74, width: 39, height: 66, relStation: '97,98' },//Sha Tin Wai - City One
					{ x: 842, y: 74, width: 64, height: 16, relStation: '98,99' },//City One - Shek Mun
					{ x: 906, y: 74, width: 64, height: 16, relStation: '99,100' },//Shek Mun - Tai Shui Hang
					{ x: 970, y: 74, width: 60, height: 16, relStation: '100,101' },//Tai Shui Hang - Heng On
					{ x: 1029, y: 74, width: 61, height: 16, relStation: '101,102' },//Heng On - Ma On Shan
					{ x: 1091, y: 74, width: 66, height: 16, relStation: '102,103' }//Ma On Shan - Wu Kai Sha
				],
				stations: [
					{ x: 693, y: 474, stationID: 'id064', stationCode: 'HUH', stationName: { en: 'Hung Hom Station', tc: '紅磡站' } },
					{ x: 631, y: 499, stationID: 'id080', stationCode: 'ETS', stationName: { en: 'East Tsim Sha Tsui', tc: '尖東站' } },
					{ x: 537, y: 467, stationID: 'id111', stationCode: 'AUS', stationName: { en: 'Austin Station', tc: '柯士甸站' } },
					{ x: 429, y: 347, stationID: 'id053', stationCode: 'NAC', stationName: { en: 'Nam Cheong Station', tc: '南昌站' } },
					{ x: 429, y: 294, stationID: 'id020', stationCode: 'MEF', stationName: { en: 'Mei Foo Station', tc: '美孚站' } },
					{ x: 147, y: 243, stationID: 'id114', stationCode: 'TWW', stationName: { en: 'Tsuen Wan West Station', tc: '荃灣西站' } },
					{ x: 120, y: 193, stationID: 'id115', stationCode: 'KSR', stationName: { en: 'Kam Sheung Road Station', tc: '錦上路站' } },
					{ x: 120, y: 150, stationID: 'id116', stationCode: 'YUL', stationName: { en: 'Yuen Long Station', tc: '元朗站' } },
					{ x: 120, y: 108, stationID: 'id117', stationCode: 'LOP', stationName: { en: 'Long Ping Station', tc: '朗屏站' } },
					{ x: 98, y: 65, stationID: 'id118', stationCode: 'TIS', stationName: { en: 'Tin Shui Wai Station', tc: '天水圍站' } },
					{ x: 76, y: 150, stationID: 'id119', stationCode: 'SIH', stationName: { en: 'Siu Hong Station', tc: '兆康站' } },
					{ x: 76, y: 210, stationID: 'id120', stationCode: 'TUM', stationName: { en: 'Tuen Mun Station', tc: '屯門站' } },
					{ x: 746, y: 432, stationID: 'id124', stationCode: 'HOM', stationName: { en: 'Ho Man Tin Station', tc: '何文田站' } },
					{ x: 831, y: 402, stationID: 'id130', stationCode: 'TKW', stationName: { en: 'To Kwa Wan Station', tc: '土瓜灣站' } },
					{ x: 866, y: 367, stationID: 'id131', stationCode: 'SUW', stationName: { en: 'Sung Wong Toi Station', tc: '宋皇臺站' } },
					{ x: 888, y: 329, stationID: 'id132', stationCode: 'KAT', stationName: { en: 'Kai Tak Station', tc: '啟德站' } },
					{ x: 887, y: 294, stationID: 'id011', stationCode: 'DIH', stationName: { en: 'Diamond Hill Station', tc: '鑽石山站' } },
					{ x: 819, y: 238, stationID: 'id133', stationCode: 'HIK', stationName: { en: 'Hin Keng Station', tc: '顯徑站' } },

					{ x: 720, y: 225, stationID: 'id067', stationCode: 'TAW', stationName: { en: 'Tai Wai Station', tc: '大圍站' } },
					{ x: 806, y: 182, stationID: 'id096', stationCode: 'CKT', stationName: { en: 'Che Kung Temple Station', tc: '車公廟站' } },
					{ x: 806, y: 137, stationID: 'id097', stationCode: 'STW', stationName: { en: 'Sha Tin Wai Station', tc: '沙田圍站' } },
					{ x: 838, y: 78, stationID: 'id098', stationCode: 'CIO', stationName: { en: 'City One Station', tc: '第一城站' } },
					{ x: 900, y: 78, stationID: 'id099', stationCode: 'SHM', stationName: { en: 'Shek Mun Station', tc: '石門站' } },
					{ x: 965, y: 78, stationID: 'id100', stationCode: 'TSH', stationName: { en: 'Tai Shui Hang Station', tc: '大水坑站' } },
					{ x: 1025, y: 78, stationID: 'id101', stationCode: 'HEO', stationName: { en: 'Heng On Station', tc: '恆安站' } },
					{ x: 1086, y: 78, stationID: 'id102', stationCode: 'MOS', stationName: { en: 'Ma On Shan Station', tc: '馬鞍山站' } },
					{ x: 1152, y: 78, stationID: 'id103', stationCode: 'WKS', stationName: { en: 'Wu Kai Sha Station', tc: '烏溪沙站' } }
				]
			},
			{
				cssClassName: 'tseung-kwan-o',
				id: '03',
				lineCode: 'TKL',
				routes: [
					{ x: 892, y: 562, width: 58, height: 13, relStation: '31,32' },//North Point - Quarry Bay
					{ x: 950, y: 445, width: 59, height: 130, relStation: '32,48' },//Quarry Bay - Yau Tong
					{ x: 1010, y: 446, width: 58, height: 13, relStation: '48,49' },//Yau Tong - Tiu Keng Leng
					{ x: 1068, y: 446, width: 61, height: 13, relStation: '49,50' },//Tiu Keng Leng - Tseung Kwan O
					{ x: 1128, y: 395, width: 33, height: 62, relStation: '50,51' },//Tseung Kwan O - Hang Hau
					{ x: 1148, y: 333, width: 13, height: 61, relStation: '51,52' },//Hang Hau - Po Lam
					{ x: 1128, y: 457, width: 33, height: 38, relStation: '50,57' }//Tseung Kwan O - LOHAS Park
				],
				stations: [
					{ x: 889, y: 567, stationID: 'id031', stationCode: 'NOP', stationName: { en: 'North Point Station', tc: '北角站' } },
					{ x: 946, y: 567, stationID: 'id032', stationCode: 'QUB', stationName: { en: 'Quarry Bay Station', tc: '鰂魚涌站' } },
					{ x: 1005, y: 448, stationID: 'id048', stationCode: 'YAT', stationName: { en: 'Yau Tong Station', tc: '油塘站' } },
					{ x: 1063, y: 448, stationID: 'id049', stationCode: 'TIK', stationName: { en: 'Tiu Keng Leng Station', tc: '調景嶺站' } },
					{ x: 1124, y: 451, stationID: 'id050', stationCode: 'TKO', stationName: { en: 'Tseung Kwan O Station', tc: '將軍澳站' } },
					{ x: 1151, y: 389, stationID: 'id051', stationCode: 'HAH', stationName: { en: 'Hang Hau Station', tc: '坑口站' } },
					{ x: 1151, y: 329, stationID: 'id052', stationCode: 'POA', stationName: { en: 'Po Lam Station', tc: '寶琳站' } },
					{ x: 1151, y: 489, stationID: 'id057', stationCode: 'LHP', stationName: { en: 'LOHAS Park Station', tc: '康城站' } }
				]
			},
			{
				cssClassName: 'tsuen-wan',
				id: '01',
				lineCode: 'TWL',
				routes: [
					{ x: 519, y: 559, width: 62, height: 16, relStation: '1,2' },//Central - Admiralty
					{ x: 581, y: 482, width: 45, height: 93, relStation: '2,3' },//Admiralty - Tsim Sha Tsui
					{ x: 609, y: 445, width: 17, height: 39, relStation: '3,4' },//Tsim Sha Tsui - Jordan
					{ x: 609, y: 408, width: 17, height: 39, relStation: '4,5' },//Jordan - Yau Ma Tei
					{ x: 609, y: 368, width: 17, height: 40, relStation: '5,6' },//Yau Ma Tei - Mong Kok
					{ x: 609, y: 327, width: 17, height: 40, relStation: '6,16' },//Mong Kok - Prince Edward
					{ x: 586, y: 285, width: 40, height: 40, relStation: '16,17' },//Prince Edward - Sham Shui Po
					{ x: 534, y: 285, width: 50, height: 15, relStation: '17,18' },//Sham Shui Po - Cheung Sha Wan
					{ x: 477, y: 286, width: 59, height: 14, relStation: '18,19' },//Cheung Sha Wan - Lai Chi Kok
					{ x: 434, y: 288, width: 43, height: 11, relStation: '19,20' },//Lai Chi Kok - Mei Foo
					{ x: 383, y: 285, width: 50, height: 15, relStation: '20,21' },//Mei Foo - Lai King
					{ x: 330, y: 285, width: 55, height: 15, relStation: '21,22' },//Lai King - Kwai Fong
					{ x: 270, y: 285, width: 60, height: 15, relStation: '22,23' },//Kwai Fong - Kwai Hing
					{ x: 210, y: 285, width: 60, height: 15, relStation: '23,24' },//Kwai Hing - Tai Wo Hau
					{ x: 150, y: 285, width: 60, height: 15, relStation: '24,25' }//Tai Wo Hau - Tsuen Wan
				],
				stations: [
					{ x: 515, y: 567, stationID: 'id001', stationCode: 'CEN', stationName: { en: 'Central Station', tc: '中環站' } },
					{ x: 575, y: 567, stationID: 'id002', stationCode: 'ADM', stationName: { en: 'Admiralty Station', tc: '金鐘站' } },
					{ x: 613, y: 481, stationID: 'id003', stationCode: 'TST', stationName: { en: 'Tsim Sha Tsui Station', tc: '尖沙咀站' } },
					{ x: 613, y: 441, stationID: 'id004', stationCode: 'JOR', stationName: { en: 'Jordan Station', tc: '佐敦站' } },
					{ x: 613, y: 402, stationID: 'id005', stationCode: 'YMT', stationName: { en: 'Yau Ma Tei Station', tc: '油麻地站' } },
					{ x: 613, y: 363, stationID: 'id006', stationCode: 'MOK', stationName: { en: 'Mong Kok Station', tc: '旺角站' } },
					{ x: 613, y: 323, stationID: 'id016', stationCode: 'PRE', stationName: { en: 'Prince Edward Station', tc: '太子站' } },
					{ x: 581, y: 288, stationID: 'id017', stationCode: 'SSP', stationName: { en: 'Sham Shui Po Station', tc: '深水埗站' } },
					{ x: 530, y: 288, stationID: 'id018', stationCode: 'CSW', stationName: { en: 'Cheung Sha Wan Station', tc: '長沙灣站' } },
					{ x: 472, y: 288, stationID: 'id019', stationCode: 'LCK', stationName: { en: 'Lai Chi Kok Station', tc: '荔枝角站' } },
					{ x: 429, y: 288, stationID: 'id020', stationCode: 'MEF', stationName: { en: 'Mei Foo Station', tc: '美孚站' } },
					{ x: 379, y: 288, stationID: 'id021', stationCode: 'LAK', stationName: { en: 'Lai King Station', tc: '荔景站' } },
					{ x: 324, y: 288, stationID: 'id022', stationCode: 'KWF', stationName: { en: 'Kwai Fong Station', tc: '葵芳站' } },
					{ x: 265, y: 288, stationID: 'id023', stationCode: 'KWH', stationName: { en: 'Kwai Hing Station', tc: '葵興站' } },
					{ x: 207, y: 288, stationID: 'id024', stationCode: 'TWH', stationName: { en: 'Tai Wo Hau Station', tc: '大窩口站' } },
					{ x: 147, y: 288, stationID: 'id025', stationCode: 'TSW', stationName: { en: 'Tsuen Wan Station', tc: '荃灣站' } }
				]
			},
			{
				cssClassName: 'east-rail',
				id: '04',
				lineCode: 'EAL',
				routes: [
					{ x: 580, y: 555, width: 57, height: 31, relStation: '2,94' },//Admiralty - Exhibition Centre
					{ x: 636, y: 482, width: 66, height: 77, relStation: '94,64' },//Exhibition Centre - Hung Hom
					{ x: 699, y: 366, width: 26, height: 119, relStation: '64,65' },//Hung Hom - Mong Kok East
					{ x: 711, y: 293, width: 17, height: 75, relStation: '65,8' },//Mong Kok East - Kowloon Tong
					{ x: 711, y: 230, width: 17, height: 63, relStation: '8,67' },//Kowloon Tong - Tai Wai
					{ x: 711, y: 186, width: 17, height: 43, relStation: '67,68' },//Tai Wai - Sha Tin
					{ x: 715, y: 141, width: 9, height: 46, relStation: '68,69' },//Sha Tin - Fo Tan
					{ x: 692, y: 76, width: 32, height: 65, relStation: '69,71' },//Fo Tan - University
					{ x: 722, y: 141, width: 28, height: 24, relStation: '68,70' },//Sha Tin - Racecourse
					{ x: 722, y: 118, width: 28, height: 24, relStation: '71,70' },//University - Racecourse
					{ x: 637, y: 76, width: 56, height: 12, relStation: '71,72' },//University - Tai Po Market
					{ x: 580, y: 76, width: 56, height: 12, relStation: '72,73' },//Tai Po Market - Tai Wo
					{ x: 526, y: 76, width: 55, height: 12, relStation: '73,74' },//Tai Wo - Fanling
					{ x: 469, y: 76, width: 56, height: 12, relStation: '74,75' },//Fanling - Sheung Shui
					{ x: 372, y: 88, width: 110, height: 23, relStation: '75,78' },//Sheung Shui - Lok Ma Chau
					{ x: 413, y: 76, width: 56, height: 12, relStation: '75,76' }//Sheung Shui - Lo Wu
				],
				stations: [
					{ x: 575, y: 577, stationID: 'id002', stationCode: 'ADM', stationName: { en: 'Admiralty Station', tc: '金鐘站' } },
					{ x: 632, y: 551, stationID: 'id094', stationCode: 'EXC', stationName: { en: 'Exhibition Centre Station', tc: '會展站' } },
					{ x: 697, y: 478, stationID: 'id064', stationCode: 'HUH', stationName: { en: 'Hung Hom Station', tc: '紅磡站' } },
					{ x: 716, y: 363, stationID: 'id065', stationCode: 'MKK', stationName: { en: 'Mong Kok East Station', tc: '旺角東站' } },
					{ x: 715, y: 293, stationID: 'id008', stationCode: 'KOT', stationName: { en: 'Kowloon Tong Station', tc: '九龍塘站' } },
					{ x: 715, y: 225, stationID: 'id067', stationCode: 'TAW', stationName: { en: 'Tai Wai Station', tc: '大圍站' } },
					{ x: 716, y: 182, stationID: 'id068', stationCode: 'SHT', stationName: { en: 'Sha Tin Station', tc: '沙田站' } },
					{ x: 716, y: 137, stationID: 'id069', stationCode: 'FOT', stationName: { en: 'Fo Tan Station', tc: '火炭站' } },
					{ x: 736, y: 137, stationID: 'id070', stationCode: 'RAC', stationName: { en: 'Racecourse Station', tc: '馬場站' } },
					{ x: 688, y: 78, stationID: 'id071', stationCode: 'UNI', stationName: { en: 'University Station', tc: '大學站' } },
					{ x: 633, y: 78, stationID: 'id072', stationCode: 'TAP', stationName: { en: 'Tai Po Market Station', tc: '大埔墟站' } },
					{ x: 577, y: 78, stationID: 'id073', stationCode: 'TWO', stationName: { en: 'Tai Wo Station', tc: '太和站' } },
					{ x: 521, y: 78, stationID: 'id074', stationCode: 'FAN', stationName: { en: 'Fanling Station', tc: '粉嶺站' } },
					{ x: 465, y: 80, stationID: 'id075', stationCode: 'SHS', stationName: { en: 'Sheung Shui Station', tc: '上水站' } },
					{ x: 410, y: 78, stationID: 'id076', stationCode: 'LOW', stationName: { en: 'Lo Wu Station', tc: '羅湖站' } },
					{ x: 368, y: 102, stationID: 'id078', stationCode: 'LMC', stationName: { en: 'Lok Ma Chau Station', tc: '落馬洲站' } }
				]
			}
		]//Lines

	};


	var lineStatus = {
		update: function (data) {
			var _o = lineStatus;
			data = data.split(',');
			if (data.length != 4) { return; }//Length must be ===4 to continue
			if (data[3] != 1 && data[3] != 2 && data[3] != 4) { return; }//Check status code, only 2 or 4 continue
			if (data[3] == 2 || data[3] == 1) {
				_o.addCrossSign(data);//Data is now array
			} else if (data[3] == 4) {
				_o.switchDottedLine(data);//Data is now array
			}
		},//Update
		addCrossSign: function (data) {//data as array
			var _o = lineStatus,
				index,
				stations,
				left,
				top,
				found = false,
				elehtmls = '';


			if (data instanceof Array === false) {
				data = data.split(',');
			}
			if (data[0] != data[1]) { return; }//Two value must be the same

			index = _o.findRailLine(data[2]);
			if (index === null) { return; }//Rail Line not found

			stations = mapData.lines[index].stations;
			for (var i = 0; i < stations.length; i++) {
				if (data[0] == stations[i].stationID) {//As data[0]==data[1], so we just need to compare either one.
					found = true;
					if (!stations[i].found) {
						stations[i].found = true;
					} else {
						return;
						//console.log('cross sign duplicated')
					}
					break;
				}
			}
			if (!found) { return; }
			left = stations[i].x - 8.5;
			top = stations[i].y - 8.5;

			let lineCode = mapData.lines[index].lineCode;
			elehtmls += '<i class="icon-animate-cross" line-code="' + lineCode + '"';


			elehtmls += ' style="left:' + left + 'px;top:' + top + 'px;"';
			//elehtmls+=' for="'+stations[i].stationName.tc+','+mapData.lines[index].cssClassName+'"';//Debug use, to see the cross sign referring which one.
			elehtmls += '></i>';
			$('.incident-map-container').append(elehtmls);
		},
		switchDottedLine: function (data) {//data as array
			var _o = lineStatus,
				index,
				routes,
				found = false;
			if (data[0] == data[1]) { return; }//Two value must NOT be the same

			index = _o.findRailLine(data[2]);
			if (index === null) { return; }//Rail Line not found

			routes = mapData.lines[index].routes;
			for (var i = 0; i < routes.length; i++) {
				var relStation = routes[i].relStation.split(','),
					s0 = 'id' + addleadingzero(relStation[0], 3),
					s1 = 'id' + addleadingzero(relStation[1], 3);


				if ((data[0] == s0 || data[0] == s1) && (data[1] == s0 || data[1] == s1)) {
					found = true;
					break;//Found
				}

			}
			if (!found) { return; }
			var scope = $('.lines-wrapper .line').eq(index),
				target = $('.route', scope).eq(i),
				cssValue = target.css('background-position'),
				newX = 0;

			cssValue = cssValue.replace(/px/g, '');
			cssValue = cssValue.split(' ');//We just need x
			newX = parseInt(cssValue[0]);

			if (newX < 0) {//>0=already showing as dotted
				newX += 1200;
				target.css({ 'background-position': newX + 'px ' + cssValue[1] + 'px' });
				target.addClass('dotted')

				//find lineCode
				let lineId = data[2];
				if (this.findRailLine != null && typeof (this.findRailLine) != 'undefined') {
					let lineIdx = this.findRailLine(lineId);
					if (lineIdx != null && lineIdx >= 0) {
						//set linecode to attr
						let _lineCode = mapData.lines[lineIdx].lineCode;
						target[0].setAttribute("line-code", _lineCode);
					}
				}

			} else {
				//console.log('dotted line duplicated')
			}

		},
		findRailLine: function (code) {
			for (var i = 0; i < mapData.lines.length; i++) {
				if (code == mapData.lines[i].id) {
					return i;
				}
			}
			return null;
		}
	};


	var core = {
		ready: function () {
			body = $('body');

			createRailLinesAndWrappers();
			createRoutesAndStations();

			if (body.hasClass('debug')) {
				debug.init();
			}

			//signs=(document.querySelectorAll) ? document.querySelectorAll('.icon-animate-cross') : jQuery("body").find(".icon-animate-cross");

			//IE 8 or lower, non-stop playing cross sign animation.
			if (!window.addEventListener || navigator.appVersion.indexOf("MSIE 9") != -1 || navigator.appVersion.indexOf("MSIE 8") != -1) {
				setInterval(function () {
					var left = (28 * crossSignAnimationCurrentFrame) * -1,
						signs = $(".icon-animate-cross");
					for (var i = 0; i < signs.length; i++) {
						signs[i].style.backgroundPosition = left + 'px 0';
					}
					crossSignAnimationCurrentFrame < 45 ? crossSignAnimationCurrentFrame++ : crossSignAnimationCurrentFrame = 0;
				}, 1000 / 36);
			}



		},
		load: function () {

		},
		scrolling: function () {
			clearTimeout(timer.scroll);
			timer.scroll = setTimeout(core.scrolled, timer.scrollEndTime);
		},
		scrolled: function () {

		},
		resizing: function () {
			clearTimeout(timer.resize);
			timer.resize = setTimeout(core.resized, timer.resizeEndTime);
		},
		resized: function () {
		}
	};


	var createRailLinesAndWrappers = function () {
		var htmls = '',
			lines = mapData.lines;
		for (var i = 0; i < lines.length; i++) {
			htmls += '<div class="line ' + lines[i].cssClassName + '">';
			htmls += '<div class="routes"></div>';
			//htmls+='<div class="stations"></div>';
			htmls += '</div>';
		}
		$('.lines-wrapper').append(htmls);

	};

	var createRoutesAndStations = function () {
		var htmls = '',
			data = mapData.lines,
			routesWrapper = $('.lines-wrapper>.line>.routes'),
			stationsWrapper = $('.lines-wrapper>.line>.stations'),
			xpos = 0;//test dotted style

		for (var i = 0; i < data.length; i++) {//Lines Loop
			var curData = data[i].routes;
			//Routes Loop
			for (var j = 0; j < curData.length; j++) {
				htmls += '<div class="route r' + j + '" style="left:' + curData[j].x + 'px;top:' + curData[j].y + 'px;background-position:' + ((curData[j].x + xpos) * -1) + 'px ' + (curData[j].y * -1) + 'px;width:' + curData[j].width + 'px;height:' + curData[j].height + 'px;"></div>';
			}
			routesWrapper.eq(i).append(htmls);
			htmls = '';

			//Stations Loop
			//curData=data[i].stations;
			//for(var j=0;j<curData.length;j++){
			//htmls+='<div class="station s'+j+'" style="left:'+curData[j].x+'px;top:'+curData[j].y+'px;"></div>';
			//}
			//stationsWrapper.eq(i).append(htmls);
			//htmls='';
		}
	};

	var addleadingzero = function (num, totallength) {
		if (typeof (num) == 'undefined' || typeof (totallength) == 'undefined') {
			return null;
		}
		num = num.toString();
		if (num.length >= totallength) {
			return num;
		}
		var zero = '';
		for (var i = 0; i < totallength - num.length; i++) {
			zero += '0';
		}
		return zero + num;
	};

	var debug = {
		init: function () {
			$(document).on('mousemove', function (evt) {
				//debug.aim(evt.pageX,evt.pageY);
			});
		},
		showAllCross: function () {
			var allstations = ["id126,id126,10,2", "id127,id127,10,2", "id128,id128,10,2", "id129,id129,10,2", "id002,id002,10,2", "id124,id124,02,2", "id125,id125,02,2", "id039,id039,07,2", "id040,id040,07,2", "id041,id041,07,2", "id053,id053,07,2", "id021,id021,07,2", "id042,id042,07,2", "id054,id054,07,2", "id043,id043,07,2", "id039,id039,08,2", "id040,id040,08,2", "id042,id042,08,2", "id047,id047,08,2", "id056,id056,08,2", "id054,id054,09,2", "id055,id055,09,2", "id064,id064,04,2", "id065,id065,04,2", "id008,id008,04,2", "id067,id067,04,2", "id068,id068,04,2", "id069,id069,04,2", "id070,id070,04,2", "id071,id071,04,2", "id072,id072,04,2", "id073,id073,04,2", "id074,id074,04,2", "id075,id075,04,2", "id076,id076,04,2", "id078,id078,04,2", "id123,id123,00,2", "id122,id122,00,2", "id121,id121,00,2", "id026,id026,00,2", "id001,id001,00,2", "id002,id002,00,2", "id027,id027,00,2", "id028,id028,00,2", "id029,id029,00,2", "id030,id030,00,2", "id031,id031,00,2", "id032,id032,00,2", "id033,id033,00,2", "id034,id034,00,2", "id035,id035,00,2", "id036,id036,00,2", "id037,id037,00,2", "id005,id005,02,2", "id006,id006,02,2", "id016,id016,02,2", "id007,id007,02,2", "id008,id008,02,2", "id009,id009,02,2", "id010,id010,02,2", "id011,id011,02,2", "id012,id012,02,2", "id013,id013,02,2", "id014,id014,02,2", "id015,id015,02,2", "id038,id038,02,2", "id048,id048,02,2", "id049,id049,02,2", "id067,id067,06,2", "id096,id096,06,2", "id097,id097,06,2", "id098,id098,06,2", "id099,id099,06,2", "id100,id100,06,2", "id101,id101,06,2", "id102,id102,06,2", "id103,id103,06,2", "id031,id031,03,2", "id032,id032,03,2", "id048,id048,03,2", "id049,id049,03,2", "id050,id050,03,2", "id051,id051,03,2", "id052,id052,03,2", "id057,id057,03,2", "id064,id064,05,2", "id080,id080,05,2", "id111,id111,05,2", "id053,id053,05,2", "id020,id020,05,2", "id114,id114,05,2", "id115,id115,05,2", "id116,id116,05,2", "id117,id117,05,2", "id118,id118,05,2", "id119,id119,05,2", "id120,id120,05,2", "id001,id001,01,2", "id002,id002,01,2", "id003,id003,01,2", "id004,id004,01,2", "id005,id005,01,2", "id006,id006,01,2", "id016,id016,01,2", "id017,id017,01,2", "id018,id018,01,2", "id019,id019,01,2", "id020,id020,01,2", "id021,id021,01,2", "id022,id022,01,2", "id023,id023,01,2", "id024,id024,01,2", "id025,id025,01,2"];
			for (var i = 0; i < allstations.length; i++) {
				lineStatus.addCrossSign(allstations[i]);
			}
		},
		aim: function (x, y) {
			var xyline = document.querySelector('#XYLine');

			document.querySelector('.devXYTip').innerHTML = 'X: ' + (x - 10) + ' Y: ' + (y - 10);
			xyline.style.left = x + 'px';
			xyline.style.top = y + 'px';
		}

	};

	incidentMap = core;
	incidentMap.data = mapData;
	incidentMap.lineStatus = lineStatus;
	incidentMap.debug = {};
	incidentMap.debug = debug;

	let getURLParam = function (name) {
		var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
		if (results != null) {
			return results[1] || 0;
		}
		else
			return "";
	}
	var p = getURLParam("p");
	if (p != "") {
		document.getElementById("mapcss").href = "./css/map_layout_withSILKTE-print.css";
	}

	return incidentMap;
})(jQuery);
