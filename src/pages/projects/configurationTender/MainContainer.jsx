import React, { useState, useEffect } from "react";
import MainComponentPage from "./MainComponentPage";
import SubCategory1Page from "./SubCategory1Page";
import SubCategory2Page from "./SubCategory2Page";
import SubCategory3Page from "./SubCategory3Page";
import SubCategory4Page from "./SubCategory4Page";
import SubCategory5Page from "./SubCategory5Page";

const STORAGE_KEY = "components_data";

const MainContainer = () => {
  const [data, setData] = useState(null);

  // Load saved data on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setData(JSON.parse(saved));
    }
  }, []);

  // Save data whenever it changes
  const handleDataLoaded = (newData) => {
    setData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  };

  return (
    <div className="space-y-10">
      <MainComponentPage onDataLoaded={handleDataLoaded} />

      {data && (
        <>
          <SubCategory1Page
            mainComponents={data.mainComponents}
            prefill={data.subCategory1}
          />
          <SubCategory2Page
            mainComponents={data.mainComponents}
            prefill={data.subCategory2}
          />
          <SubCategory3Page
            mainComponents={data.mainComponents}
            prefill={data.subCategory3}
          />
          <SubCategory4Page
            mainComponents={data.mainComponents}
            prefill={data.subCategory4}
          />
          <SubCategory5Page
            mainComponents={data.mainComponents}
            prefill={data.subCategory5}
          />
        </>
      )}
    </div>
  );
};

export default MainContainer;
