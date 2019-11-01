const express = require('express');
const router = express.Router();

const fs = require('fs');
const multer = require('multer');

const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');

const epd = require('../modules/epd_engine');
const epd_tool = require('../modules/app_tools');

const currentPath = (process.env.EPDPATH || './back_node').trim();


/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', {
    title: 'Express'
  });
});

/**
 * 得到已经装载的模板列表
 */
router.get('/list', (req, res) => {
  let tplNameArr = epd.M_getAllTemplateNames();
  res.json(tplNameArr);
});

/**
 * 根据模板名称得到模板数据
 */
router.get('/template/:tplName', (req, res) => {
  let tplObj = epd.M_getTemplateDataByName(req.params.tplName);
  res.json(tplObj);
});

/**
 * 刷新模板内容
 */
router.get('/refresh', (req, res) => {
  epd_tool.initAllTemplate(`${currentPath}/public/rules`).then(reslut=>{
    res.json({status:"ok"});
  });
});

/**
 * 调用模板方法
 * tplName：模板名称
 * body内容为inputParameters
 */
router.post('/epd/:tplName', (req, res) => {
  let result = epd.M_calResultByRule({
    "tplName": req.params.tplName, // 模板名称
    "inputParameters": req.body
  });

  res.json(result);
});

/**
 * 将模板进行简化
 */
router.post('/simplify', (req, res) => {
  let simplifedObj = epd_tool.simplifyRuleTemplate(req.body);
  res.json(simplifedObj);
});

/**
 * 处理文件上传需求
 */
var upload = multer({
  dest: `${currentPath}/tmp`,
  fileFilter: (req, file, cd) => {
    if (file.mimetype == "application/json") {
      cd(null, true);
    } else {
      req.error = "不允许上传" + file.mimetype + "类型的文件！";
      cd(null, false);
    }
  }
});

router.post('/upload', upload.any(), (req, res) => {
  let tplName = req.body.tplName;
  if (!tplName) {
    res.json({
      status: "error",
      message: "Template Name is NULL!!"
    });
    return;
  }

  let tplNameArr = epd.M_getAllTemplateNames();
  if (tplNameArr.includes(tplName)) {
    res.json({
      status: "error",
      message: "Template Name is REPEATED!!"
    });
    return;
  }

  if (!req.files[0]) {
    console.log(req.error);
    res.json({
      status: "error",
      message: req.error
    });
    return;
  }

  var des_file = `${currentPath}/public/rules/${tplName}.json`;
  fs.readFile(req.files[0].path, function (err, data) {
    let dataStr = decoder.write(data);
    let simplifedObj = epd_tool.simplifyRuleTemplate(JSON.parse(dataStr));
    let simplifedStr = JSON.stringify(simplifedObj);
    fs.writeFile(des_file, simplifedStr, function (err) {
      if (err) {
        console.log(err);
        res.json({
          status: "error",
          message: "Server ERROR!!"
        });

      } else {
        epd_tool.initAllTemplate(`${currentPath}/public/rules`);
        res.json({
          status: "ok",
          message: ""
        });
      }
    });
  });
});

/**
 * 清空临时目录
 */
router.get('/clean', (req, res) => {
  let desDir = `${currentPath}/tmp/`;
  fs.readdir(desDir, function (err, files) {
    if (err) {
      console.log(err);
      res.send('ERROR');
      return;
    }
    for (var i = 0; i < files.length; i++) {
      // 使用 unlink 删除
      fs.unlink(desDir + files[i], function (err) {
        if (err) {
          console.log(err);
          res.send('ERROR');
          return;
        }
      });
    }
    res.send('OK');
  });
});

module.exports = router;